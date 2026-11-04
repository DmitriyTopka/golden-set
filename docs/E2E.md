# E4 end-to-end run, 04.11.2026

Site: one-atlas-kzrl.atlassian.net (demo site, synthetic Northwind data only).
Agent under test: Northwind Support v1 (Rovo Studio agent). Judge: Rovo Evaluations, Response Accuracy.
Article: Returns policy (page 3571713), 12 golden pairs rely on it.

## What happened, step by step

| # | Step | Result | Status |
|---|------|--------|--------|
| 1 | Build the golden set from 80 resolved requests | 15 rejected, 5 duplicates folded, 50 pairs across 7 articles | ✅ |
| 2 | Re-test CSV for Returns policy, article says 30 days | Evals #001: 92% (11 of 12) | ✅ |
| 3 | Edit the article: 30 days -> 14 days | The five minute check found it in 4.5 min; on-open check finds it at once | ✅ |
| 4 | Golden Set screen | "12 golden answers depend on this page, 8 likely outdated", suggested answers for all 8 | ✅ |
| 5 | Byline under the article in Confluence | "Golden Set: 8 of 12 answers may be outdated" | ✅ |
| 6 | Rovo agent "Golden Set", question "Which golden answers did the last article edit break?" | Named the article, the change 30 -> 14 and the 8 answers with suggestions | ✅ |
| 7 | Same 30-day CSV re-run after the edit | Evals #002: 33% (4 of 12). Exactly the 8 answers Golden Set flagged failed | ✅ |
| 8 | Apply 8 suggested answers and accept the edit, download CSV for Returns policy | 12 rows, expected answers now say 14 days, file passes tools/check-csv.mjs | ✅ |
| 9 | Re-run with the updated answers | Evals #003: 83% (10 of 12) | ✅ with two findings below |
| 10 | Put the demo back: article 14 -> 30, on-open check, apply | Edit found (version 6 to 7), 8 suggestions applied, "No article has changed" | ✅ |

The headline numbers: 92% before the edit, 33% after it, 83% after applying the suggestions.
Golden Set predicted which 8 answers would break before any evaluation was run, and #002 confirmed all 8.

## The two failures in #003, and what they mean

1. **NS-2 smartwatch, a real Golden Set bug.** Question: "It arrived about three weeks ago, can I still return it?"
   The original answer was "You have 30 days from delivery to return it, so you are still in time."
   The suggestion swapped the number only: "You have 14 days ... so you are still in time". Three weeks is more
   than 14 days, so the verdict flipped and the suggestion became wrong. The agent answered correctly (passes to a
   human), the judge marked it as failed against our wrong expected answer.
   Cause: `suggestFix` in core/diff.js replaces numbers but cannot tell when the rest of the answer is a verdict
   that depends on the number. Proposed fix (E5): when the question has an elapsed time ("three weeks ago",
   "25 days ago", "last month") and the answer has a verdict ("still in time", "too late", "you can still"),
   give no suggestion and mark the pair "needs a human look" instead. Apply then skips it.
2. **NS-8 sale items, a knowledge base gap, not a Golden Set bug.** The expected answer ("sale items have the same
   return window") came from a human agent's resolved request. The Returns policy article never mentions sale items,
   so the Rovo agent correctly said it could not confirm and passed the request on. Golden Set could surface this
   later as "answer not backed by the article".

## Evidence

Screenshots in docs/e2e/:
- 03-impact-suggestions.jpg: impact block with the 8 suggested answers (14 days)
- 05-after-accept.jpg: after Apply, "No article has changed since the golden set was built"
- 06-filter-returns-policy.jpg: pairs filtered to Returns policy (12), "Download CSV for Returns policy"
- 07-evals-92-33-83.jpg: the three evaluation runs side by side
- 08-eval-003-top.jpg, 09-eval-003-smartwatch.jpg: #003 details, both failures visible
- 10-revert-14-to-30.jpg: the edit back to 30 days found on page open

Runs #001 and #002 and the Rovo agent answer were checked live earlier the same day; their screenshots are not
in this folder and will be taken again for the video in E6.

## Not verified

- How many Rovo credits the three evaluation runs used. Studio does not show it on the evaluation page.
- The app with the rovo:agent module on the second site (gs-judge-test). Gate item 8 still open.
