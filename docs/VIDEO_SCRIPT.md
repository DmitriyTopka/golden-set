# Golden Set: video script

Target 3:50 total. Judges are not required to watch past 3:00, so the whole story (problem, edit, prediction, proof) ends by 2:45.
All footage is screen recording of the real app on the demo site (one-atlas-kzrl), 1080p. No music from third parties, no logos beyond the Atlassian product UI itself. Voice: English, about 140 words per minute.

Before recording: article Returns policy at 30 days, no open edit, no edited pairs, Rovo chat history cleared, browser zoom 110%, notifications off.

| # | Time | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00-0:12 | Confluence, page Returns policy. Cursor changes "30 days" to "14 days", Publish. | One small edit to a help article. Thirty days becomes fourteen. Your support agent answers from this page. |
| 2 | 0:12-0:24 | Same page after reload. Zoom on the line under the title: "Golden Set: 8 of 12 answers may be outdated". | Golden Set shows, right on the page, which tested support answers this edit just made wrong. |
| 3 | 0:24-0:30 | Title card on plain background: "Golden Set. See which support answers break when you edit a help article." | Golden Set. See which support answers break when you edit a help article. |
| 4 | 0:30-1:05 | JSM project, Queues > Golden Set. Section 3: "Returns policy was edited, 30 days -> 14 days, 12 golden answers depend on this page, 8 likely outdated". Slow scroll through the rows: old answer, status, suggested answer. Stop on the smartwatch row, "Needs a person". | Golden Set keeps verified questions and answers from your resolved requests. Twelve of them rely on this article. Eight now state the old window. For each one Golden Set suggests the corrected answer. This one it refuses to guess: the customer said the watch arrived three weeks ago. With thirty days that customer was in time. With fourteen, they are not. Swapping thirty for fourteen would read fine and be wrong, so a person decides. |
| 5 | 1:05-1:25 | Click Edit on the smartwatch row, type a new answer, Save. Then "Apply 7 suggested answers and accept edit". Section shows "No article has changed". | Rewrite it, apply the rest, accept the edit. Now the saved answers agree with the new article. |
| 6 | 1:25-2:15 | Rovo Studio, Evaluation tab: three runs #001 92%, #002 33%, #003 83%. Open #002 and hold on the failed rows next to Golden Set's list of 8, so the match is visible. | But was the prediction right? We ran Rovo Agent Evaluations on the same twelve questions. Before the edit: 92 percent. After the edit: 33. The eight failures are exactly the eight answers Golden Set flagged, before any evaluation ran. After applying the suggestions: 83. The two misses are the three weeks case, and a question the article never covered. |
| 7 | 2:15-2:45 | Rovo chat, Golden Set agent. Ask "Which golden answers did the last article edit break?". Answer appears with article, change and list. Then "Give me the re-test CSV for Returns policy". | The Golden Set agent answers in Rovo chat, and hands you the re-test file for Evaluations. It never shows anything you could not open yourself. |
| 8 | 2:45-3:15 | Section 2: "Scan resolved requests", stats 80 / 15 / 5 / 50. Section 4: pairs table, filter by article, a row with [email] redacted, "Why requests were left out" opened. | Where do the golden answers come from? From your own resolved requests. Golden Set keeps the ones that were solved: not reopened, no complaint, no low rating. It strips personal data and ties every answer to its article. Eighty requests in: fifteen rejected, five duplicates, ten in reserve, fifty golden pairs. |
| 9 | 3:15-3:40 | One pair with [email] and [phone] redacted, then a simple diagram (drawn by us): JSM requests -> Golden Set core -> pairs; Confluence article edit -> diff -> affected pairs -> byline, Rovo agent, CSV -> Evaluations. Captions: "No LLM of our own", "Works without Rovo", "Runs as the user". | It compares the facts in each answer, numbers, money and durations, with the old and the new article. No language model of our own runs here, so it costs nothing and gives the same result every time. It works without Rovo, and every view runs with your own permissions. |
| 10 | 3:40-3:50 | Title card: "Golden Set. Evaluations give you a test runner. Golden Set gives you the test set." | Evaluations give you a test runner. Golden Set gives you the test set, and tells you which tests each edit can break. |

Word count of the voiceover: 345 words, about 148 seconds of speech at 140 words per minute; the rest of the 3:50 is pauses and on-screen action.

## Shot list for recording

1. Confluence edit 30 -> 14 and the byline after reload (scenes 1-2).
2. Golden Set page with the open edit, scroll, smartwatch row (scene 4).
3. Edit and Apply (scene 5). Record this take last, it changes the data.
4. Rovo Studio evaluations, existing runs #001-#003 (scene 6). No new runs needed.
5. Rovo chat with the Golden Set agent (scene 7).
6. Scan and pairs table on a fresh project or the existing one (scene 8).
7. Diagram and two title cards (scenes 3, 9, 10): static slides.

After recording, put the demo back: article to 30 days, undo the smartwatch rewrite, undo applied answers.

## Checks before upload

- Length under 5:00; story finished by 3:00.
- Public on YouTube, opens without login.
- No third-party music or trademarks beyond the Atlassian product UI.
- Voiceover and on-screen text in English.
- A viewer who only reads the transcript can say what the app does after 30 seconds (check with a subagent "judge").

## Judge check (04.11)

A subagent judge read only the voiceover: after 30 seconds it could say what the app does; whole pitch 7/10 on Presentation. Applied: plainer lines, golden pair defined, the other 30 requests explained, how the edit check works without a model, proof shots for the 8 failures and for redaction. Not applied: "before you save" (Golden Set works after the edit is published).
