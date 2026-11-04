# Devpost submission: Golden Set

Draft for the Devpost form. One section per field.

## Project name

Golden Set

## Tagline (elevator pitch)

See which support answers break when you edit a help article.

## Category and bonus

- Category: Apps for Business Teams (support teams). Decided by Dima on 04.11.
- Bonus prize: Best Agents - Rovo/Assignable agents (rovo:agent module with three rovo:action modules).

## Inspiration

I worked on a support bot for an electronics shop. The bot answered from help articles, and the articles kept changing: a return window, a delivery fee, a warranty term. Every edit was small and sensible. Nobody could say which of yesterday's correct answers it had just turned wrong.

Rovo Agent Evaluations can re-test an agent, but you have to bring the questions and the expected answers yourself, in a CSV you write by hand. Most teams never write it. And even with a test set, nothing tells you which tests a given edit puts at risk.

Evaluations give you a test runner. Golden Set gives you the test set, and the map of which tests each article can break.

## What it does

Golden Set is a Forge app for Jira Service Management and Confluence, with a Rovo agent.

1. **Builds a golden set from resolved requests.** It reads closed requests, keeps the ones that were solved (not reopened, no complaint after the answer, no low satisfaction rating), strips personal data and keeps up to 50 question and answer pairs. Each pair is tied to the Confluence article it relies on: by the link the agent pasted, or by matching facts when there is no link. On our demo project: 80 resolved requests in, 15 rejected with a reason, 5 duplicates folded, 50 golden pairs across 7 articles.
2. **Watches the articles.** Every five minutes, and each time an admin opens the page, it compares each article with the text the answers were written against. Change "30 days" to "14 days" in Returns policy and Golden Set shows: 12 golden answers depend on this page, 8 are likely outdated, here is the change, here is a suggested new answer for each.
3. **Knows when not to guess.** One customer wrote that the item "arrived about three weeks ago", and the answer said "so you are still in time". Swapping 30 for 14 would keep the words and flip the truth. Golden Set marks that answer "Needs a person" instead of suggesting a wrong one. We found this case in our own end-to-end run and built the rule from it.
4. **Shows it where people edit.** A line under the article title in Confluence says "Golden Set: 8 of 12 answers may be outdated". It shows counts only, never customer text.
5. **Closes the loop with Rovo Evaluations.** One click downloads the affected pairs as an Evaluations dataset. In our run the same 12 questions scored 92% before the edit and 33% after it. The 8 failures were exactly the 8 answers Golden Set had flagged before any evaluation ran. After applying the suggestions the score came back to 83%; the two remaining failures were the "three weeks" answer above and a question the help article never covered.
6. **Answers in Rovo chat.** The Golden Set agent answers "Which golden answers did the last article edit break?", shows the golden answers for an article, and hands over the re-test CSV.
7. **Lets admins stay in charge.** Admins can mark a pair "not golden", restore it, rewrite an expected answer, undo the rewrite, and accept an edit with or without the suggestions. Rewrites survive a rescan.

## How we built it

- **Forge** with a JSM queue page (Custom UI, React), a Confluence byline item, a scheduled trigger, a Rovo agent with three read-only actions, and Forge KVS storage.
- **One installation for Jira and Confluence** (app compatibility: Jira required, Confluence optional), so data, permissions and the Rovo agent are shared and Rovo lists one Golden Set agent.
- **A deterministic core with no LLM of its own**: personal data redaction (emails, phones, cards with a Luhn check, IBAN, names from the request), answer cleanup, fact extraction (numbers, money, percentages, durations), linking, scoring, deduplication, article diff and suggestions. Same input, same result, zero inference cost. 126 unit tests, including a "dirty" set of realistic requests.
- **Permissions checked as the asking user** everywhere: Browse projects and access to the knowledge base space to read, Administer projects to change anything, per-request visibility (issue security) and per-page restrictions in Confluence. The page and the Rovo actions use the same gate.
- **Forge limits respected**: scans and demo data run in short steps under the 25 second resolver limit; text is capped to stay under the storage value limit; only redacted candidates are ever stored.

## Challenges we ran into

- **Two installations, two storages, two agents.** Jira and Confluence first got separate installations with separate storage, so a Confluence event saw an empty index and Rovo showed two Golden Set agents. We moved to one installation with app compatibility and publish the byline counts through a Confluence page property.
- **A correct number can still give a wrong answer.** The "three weeks ago" case above. Our first suggestion engine swapped numbers only; the evaluation run caught it, and now verdicts that depend on elapsed time go to a person.
- **Clean sites behave differently.** On a fresh judge-like site, demo data first raised all 80 requests on behalf of the admin who clicked the button, so every request looked self-answered and the scan rejected all of them. We fixed it and now test every release on an empty site.
- **An independent review** found 17 issues, including demo data that could notify real customers of other projects. We fixed 15, could not reproduce one against the live API, and partly addressed one.

## Accomplishments that we're proud of

- The prediction held: Golden Set named the 8 broken answers before Evaluations confirmed them (92% -> 33% -> 83%).
- It works without Rovo. On a clean site we ran the scan, the edit check, the Confluence line and the CSV without touching Rovo: 5 of 5.
- Exports carry no personal data: the CSV from the clean site had 50 rows, 0 email addresses and 0 customer or agent names.

## What we learned

- The test set is the hard part of evaluating an agent, not the runner.
- Help articles change in small, sensible edits, and those are the dangerous ones.
- Check the boring path on an empty site before you trust the demo.

## What's next for Golden Set

- Facts beyond numbers: renamed products, removed steps, new exceptions.
- More than one knowledge base space per project.
- A weekly digest for knowledge base owners: which articles carry the most tested answers.

## How it meets the technology requirement

Golden Set is a Forge app (manifest, Forge runtime, Forge KVS, scheduled trigger, Custom UI) that integrates with Jira Service Management (resolved requests, comments, satisfaction ratings, permissions), Confluence (articles, versions, page properties, byline item) and Rovo (rovo:agent with three rovo:action modules), and its output is built for Rovo Agent Evaluations.

## Bonus prize write-up: Best Agents

The Golden Set agent is a Forge rovo:agent with three read-only rovo:action modules: list-article-impacts, get-article-pairs and get-retest-csv. Ask it "Which golden answers did the last article edit break?" and it names the article, the change ("30 days -> 14 days") and the answers that are likely outdated, with a suggested new answer for each. Ask for the re-test CSV and it returns a dataset ready for Rovo Evaluations. Each action runs as the asking user and answers only with requests, pages and spaces that user could open in Jira and Confluence.

## Testing instructions

See docs/JUDGES.md in the repository: install link, one-click demo data, a 10 minute walkthrough with the numbers you should see, and why each permission is needed.

## Built with

forge, javascript, react, jira-service-management, confluence, rovo, forge-kvs
