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
