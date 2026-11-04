// Builds a "golden pair" candidate from one closed JSM request.
//
// Input is our internal request shape. The Forge adapter (Э1) maps JSM REST responses into it:
// {
//   key: 'NW-12',
//   reporter: { id, name },
//   summary, description,
//   statusHistory: [{ fromCategory: 'new'|'indeterminate'|'done', toCategory, at }],
//   comments: [{ id, author: { id, name, accountType? }, public: boolean, body, created }],
//     accountType as in Atlassian REST: 'atlassian' (agent), 'customer', 'app'
//   resolvedAt: ISO string,
//   csat: 1..5 | null
// }

import { stripMarkup, normalizeSpace, splitSentences } from './text.js';
import { redactPII } from './pii.js';
import { normalizeAnswer } from './normalize.js';
import { findPageRefs, stripLinks } from './links.js';

const GRATITUDE =
  /^(ok(ay)?[,.!]?\s*)?(thanks?|thank you|thx|cheers|great|perfect|awesome|got it|that helps|that worked|all good|resolved)\b[^?]*$/i;
// "Thanks, but it still does not work" is a complaint, not gratitude.
const DISSATISFIED = /\b(but|still|not|however|although|issue|problem|wrong|broken)\b|n't\b/i;
// Automation rules and apps post public comments too ("Your request has been resolved").
const AUTOMATION = /\b(automation|bot|system|jira service management widget)\b/i;

const time = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** A human agent: not the reporter, not a customer account, not an app or automation rule. */
export function isAgentAuthor(author, reporterId) {
  if (!author?.id || author.id === reporterId) return false;
  if (author.accountType && author.accountType !== 'atlassian') return false;
  return !AUTOMATION.test(author.name || '');
}

export const REJECT = {
  NO_ANSWER: 'no_public_agent_answer',
  REOPENED: 'reopened',
  COMPLAINT: 'customer_followed_up',
  LOW_CSAT: 'low_csat',
  EMPTY_QUESTION: 'empty_question',
  EMPTY_ANSWER: 'answer_has_no_content',
};

export function isReopened(statusHistory = []) {
  return statusHistory.some((h) => h.fromCategory === 'done' && h.toCategory !== 'done');
}

// JSM returns offsets like "2026-09-01T09:30:00.000+0200", so compare parsed times, never strings.
function byCreated(a, b) {
  return time(a.created) - time(b.created);
}

// Contact lines like "Call me on [phone]" carry nothing an agent should be tested on.
function isContactNoise(sentence) {
  return /\[(email|phone|order|card)\]/.test(sentence) && !sentence.includes('?') && sentence.split(/\s+/).length <= 10;
}

export function cleanQuestion(summary, description, names = []) {
  const head = normalizeSpace(redactPII(summary || '', { names }));
  const body = splitSentences(redactPII(stripMarkup(description || ''), { names })).filter((s) => !isContactNoise(s));
  const first = head && !/[.!?]$/.test(head) ? `${head}.` : head;
  return normalizeSpace([first, ...body].filter(Boolean).join(' '));
}

/**
 * @returns {{ ok: true, pair: object } | { ok: false, key: string, reason: string }}
 */
export function buildCandidate(request) {
  const reporterId = request.reporter?.id;
  const comments = [...(request.comments || [])].filter((c) => c.public).sort(byCreated);
  const resolvedAt = request.resolvedAt ? time(request.resolvedAt) : Infinity;

  const agentReplies = comments.filter((c) => isAgentAuthor(c.author, reporterId) && time(c.created) <= resolvedAt);
  const answer = agentReplies[agentReplies.length - 1];
  if (!answer) return { ok: false, key: request.key, reason: REJECT.NO_ANSWER };
  if (isReopened(request.statusHistory)) return { ok: false, key: request.key, reason: REJECT.REOPENED };
  if (request.csat != null && request.csat <= 2) return { ok: false, key: request.key, reason: REJECT.LOW_CSAT };

  const after = comments.filter((c) => c.author?.id === reporterId && time(c.created) > time(answer.created));
  const followUps = after.map((c) => normalizeSpace(stripMarkup(c.body)));
  const thanked = followUps.length > 0 && followUps.every((t) => GRATITUDE.test(t) && !DISSATISFIED.test(t));
  if (followUps.length > 0 && !thanked) return { ok: false, key: request.key, reason: REJECT.COMPLAINT };

  const names = [request.reporter?.name, answer.author?.name].filter(Boolean);
  const question = cleanQuestion(request.summary, request.description, names);
  if (!question) return { ok: false, key: request.key, reason: REJECT.EMPTY_QUESTION };

  const answerText = stripMarkup(answer.body);
  const refs = findPageRefs(answer.body);
  const answerClean = redactPII(stripLinks(answerText), { names });
  const expected = normalizeAnswer(answerClean);
  // "See <link>" or "Done." teaches an agent nothing and gives Evaluations nothing to compare.
  if (expected.replace(/[^\p{L}\p{N}]/gu, '').length < 12) return { ok: false, key: request.key, reason: REJECT.EMPTY_ANSWER };

  return {
    ok: true,
    pair: {
      id: request.key,
      summary: normalizeSpace(redactPII(request.summary || '', { names })),
      question,
      answerOriginal: normalizeSpace(answerClean),
      expected,
      refs,
      signals: {
        csat: request.csat ?? null,
        thanked,
        noFollowUp: followUps.length === 0,
      },
      answeredAt: answer.created,
    },
  };
}

/** Score from verifiable signals. Linking bonus is added later, once articles are known. */
export function baseScore(signals) {
  let score = 0;
  if (signals.csat >= 4) score += 2;
  if (signals.thanked) score += 1;
  if (signals.noFollowUp) score += 1;
  return score;
}

export const LINK_BONUS = { link: 4, fact: 1 };
