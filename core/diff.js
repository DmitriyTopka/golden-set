// What changed in a help article, and which golden answers that change can break.
// Compares the current version with the last version Golden Set checked (not simply N-1),
// so a series of small edits is judged as one change.

import { splitSentences, sentenceKey, stripMarkup } from './text.js';
import { extractFacts, factKeys, extractTerms } from './facts.js';

/**
 * @param {string} oldBody
 * @param {string} newBody
 */
export function diffArticle(oldBody, newBody) {
  const oldSentences = splitSentences(oldBody);
  const newSentences = splitSentences(newBody);
  const newKeys = new Set(newSentences.map(sentenceKey));
  const oldKeys = new Set(oldSentences.map(sentenceKey));

  const removed = oldSentences.filter((s) => !newKeys.has(sentenceKey(s)));
  const added = newSentences.filter((s) => !oldKeys.has(sentenceKey(s)));

  const newText = stripMarkup(newBody);
  const newFacts = factKeys(newText);
  const newTerms = extractTerms(newText);
  const addedFacts = added.flatMap((s) => extractFacts(s));

  const outdatedFacts = [];
  const seen = new Set();
  for (const s of removed) {
    for (const f of extractFacts(s)) {
      if (newFacts.has(f.key) || seen.has(f.key)) continue;
      seen.add(f.key);
      const replacement = addedFacts.find((a) => a.kind === f.kind && a.key !== f.key && sameUnit(a.key, f.key));
      outdatedFacts.push({ ...f, replacedBy: replacement ? replacement.raw : null, sentence: s });
    }
  }

  const removedTerms = new Set();
  for (const s of removed) for (const t of extractTerms(s)) if (!newTerms.has(t)) removedTerms.add(t);

  return {
    changed: removed.length > 0 || added.length > 0,
    // Nothing was removed or reworded: old answers are still literally true, only worth a glance.
    additionsOnly: removed.length === 0 && added.length > 0,
    removedSentences: removed,
    addedSentences: added,
    outdatedFacts,
    removedTerms: [...removedTerms],
    factsDetected: outdatedFacts.length > 0 || removedTerms.size > 0,
  };
}

function sameUnit(a, b) {
  const unit = (k) => k.split(' ').slice(1).join(' ');
  return unit(a) === unit(b);
}

export const IMPACT = {
  OUTDATED: 'likely_outdated',
  RECHECK: 'recheck',
  RECHECK_ALL: 'facts_not_detected_recheck_all',
  NEW_TEXT: 'new_text_only',
};

/**
 * @param {{id:string, answerOriginal:string, expected:string}[]} pairs pairs linked to the edited page
 * @param {ReturnType<typeof diffArticle>} diff
 */
export function computeImpact(pairs, diff) {
  if (!diff.changed) return { affected: [], counts: { affected: 0, outdated: 0, recheck: 0 } };
  const outdatedKeys = new Set(diff.outdatedFacts.map((f) => f.key));
  const removedTerms = new Set(diff.removedTerms);

  const affected = pairs.map((p) => {
    const text = `${p.answerOriginal} ${p.expected}`;
    const hitFacts = [...factKeys(text)].filter((k) => outdatedKeys.has(k));
    const hitTerms = [...extractTerms(text)].filter((t) => removedTerms.has(t));
    let status = IMPACT.RECHECK;
    if (diff.additionsOnly) status = IMPACT.NEW_TEXT;
    else if (!diff.factsDetected) status = IMPACT.RECHECK_ALL;
    else if (hitFacts.length > 0 || hitTerms.length > 0) status = IMPACT.OUTDATED;
    const reasons = [
      ...diff.outdatedFacts.filter((f) => hitFacts.includes(f.key)).map((f) => (f.replacedBy ? `${f.raw} -> ${f.replacedBy}` : `${f.raw} removed`)),
      ...hitTerms.map((t) => `"${t}" no longer in article`),
    ];
    return { id: p.id, status, reasons };
  });

  const outdated = affected.filter((a) => a.status === IMPACT.OUTDATED).length;
  return {
    affected,
    counts: { affected: affected.length, outdated, recheck: affected.length - outdated },
  };
}

const numberOf = (key) => {
  const m = key.match(/:(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?/);
  return m ? m.slice(1).filter(Boolean) : [];
};

/**
 * Suggests an updated expected answer by swapping the changed numbers, e.g. "30 days" -> "14 days".
 * Only touches facts written with digits; "thirty days" gets no suggestion rather than a wrong one.
 * @returns {string|null} the new text, or null when nothing could be swapped safely
 */
export function suggestFix(expected, outdatedFacts) {
  let out = String(expected || '');
  let changed = false;
  const present = extractFacts(out);
  for (const f of outdatedFacts) {
    if (!f.replacedBy) continue;
    const replacement = extractFacts(f.replacedBy)[0];
    if (!replacement) continue;
    const oldNums = numberOf(f.key);
    const newNums = numberOf(replacement.key);
    if (oldNums.length !== newNums.length || oldNums.length === 0) continue;
    for (const p of present.filter((x) => x.key === f.key)) {
      if (!/\d/.test(p.raw)) continue;
      // Rebuild the phrase from its own wording so "30-day" stays "14-day" and "30 days" stays "14 days".
      let next = p.raw;
      oldNums.forEach((n, i) => {
        next = next.replace(new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}(?![\\d])`), `$1${newNums[i]}`);
      });
      if (next !== p.raw) {
        out = out.split(p.raw).join(next);
        changed = true;
      }
    }
  }
  return changed ? out : null;
}

// "three weeks ago", "25 days ago", "a month ago", "last month": how long ago the customer bought or got the item.
const COUNT = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|few|several|a couple of)';
const ELAPSED = new RegExp(`\\b(?:(?:about|around|almost|nearly|over|just over|more than|less than)\\s+)?${COUNT}\\s+(?:day|week|month|year)s?\\s+ago\\b|\\blast\\s+(?:week|month|year)\\b`, 'i');
// A sentence that decides the case: yes or no, still in time, too late, within or outside the window.
const VERDICT = /^\s*(?:yes|no)\b|\b(?:still|in time|too late|no longer|already|expired|within the window|outside the window|not eligible|eligible|you cannot|you can't)\b/i;
// The same words inside a condition do not decide anything: "If it arrived less than 30 days ago you can still return it."
const CONDITION = /\b(?:if|as long as|unless|provided that|when)\b/i;

/** True when the answer gives a verdict that was worked out from the elapsed time in the question. */
export function verdictDependsOnElapsedTime(question, expected) {
  if (!ELAPSED.test(String(question || ''))) return false;
  return splitSentences(String(expected || '')).some((s) => VERDICT.test(s) && !CONDITION.test(s));
}

/**
 * Suggested expected answer for one pair. Swapping the number is only safe when nothing else in the
 * answer was derived from it: "arrived three weeks ago ... you are still in time" stays true with
 * 30 days and becomes false with 14, so such answers go to a person instead.
 * @param {{question:string, expected:string}} pair
 * @returns {{suggestion: string|null, needsReview: string|null}}
 */
export function suggestAnswer(pair, outdatedFacts) {
  const suggestion = suggestFix(pair.expected, outdatedFacts);
  if (suggestion && verdictDependsOnElapsedTime(pair.question, pair.expected)) return { suggestion: null, needsReview: 'verdict_depends_on_elapsed_time' };
  return { suggestion, needsReview: null };
}
