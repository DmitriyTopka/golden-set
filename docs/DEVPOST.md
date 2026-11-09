# Devpost submission: Golden Set

Draft for the Devpost form. One section per field.

## Project name

Golden Set

## Tagline (elevator pitch)

See which support answers break when you edit a help article. It predicted all 8 failures before Rovo Evaluations ran (92% -> 33%).

## Category and bonus

- Category: Apps for Business Teams (support teams).
- Bonus prize: Best Agents - Rovo/Assignable agents (rovo:agent module with three rovo:action modules). The same three actions are also exposed as an MCP server (rovo:mcp); the submission form allows one bonus.

## In one minute

**Who it is for.** Support leads and knowledge base owners who run a Jira Service Management help desk on Confluence articles, with or without a Rovo agent answering customers.

**What breaks.** A small, sensible edit to a help article (30 days becomes 14) quietly turns yesterday's correct answers wrong. Nobody knows which ones.

**What Golden Set does.** It turns your resolved requests into a *golden set*: verified pairs of a customer question and the answer that solved it, each tied to the article it relies on. When that article changes, Golden Set names the pairs that are now wrong and suggests new answers.

**The proof.** Before any test ran, Golden Set flagged 8 of the 12 answers that rely on Returns policy. Rovo Agent Evaluations then failed exactly those 8: 92% before the edit, 33% after it, 83% after the suggested fixes.

**What you will see in three minutes.** Load the demo data, scan, press **Make the demo edit**, and the 8 answers at risk appear with a suggested fix for each.

## Inspiration

I worked on a support bot for an electronics shop. The bot answered from help articles, and the articles kept changing: a return window, a delivery fee, a warranty term. Every edit was small and sensible. Nobody could say which of yesterday's correct answers it had just turned wrong.

Rovo Agent Evaluations can re-test an agent, but you have to bring the questions and the expected answers yourself, in a CSV you write by hand. Most teams never write it. And even with a test set, nothing tells you which tests a given edit puts at risk.

Evaluations give you a test runner. Golden Set gives you the test set, and the map of which tests each article can break.

## What it does

Golden Set is a Forge app for Jira Service Management and Confluence, with a Rovo agent.

1. **Builds a golden set from resolved requests.** It reads closed requests, keeps the ones that were solved (not reopened, no complaint after the answer, no low satisfaction rating), strips personal data and keeps up to 50 question and answer pairs. Each pair is tied to the Confluence article it relies on: by the link the agent pasted, or by matching facts when there is no link. On our demo project: 80 resolved requests in, 15 rejected with a reason, 5 duplicates folded, 50 golden pairs across 7 articles.
2. **Watches the articles.** Every five minutes, and each time an admin opens the page, it compares each article with the text the answers were written against. Change "30 days" to "14 days" in Returns policy and Golden Set shows: 12 golden answers depend on this page, 8 are likely outdated, here is the change, here is a suggested new answer for each.
3. **Knows when not to guess.** One customer wrote that the watch "arrived about three weeks ago", and the answer said "so you are still in time". With 30 days that was true. With 14 days it is false, because the answer depends on how long ago the item arrived. Replacing 30 with 14 would keep the sentence and make it wrong, so Golden Set marks that answer "Needs a person" instead of suggesting one. We found this case in our own end-to-end run and built the rule from it.
4. **Shows it where people edit.** A line under the article title in Confluence says "Golden Set: 8 of 12 answers may be outdated". It shows counts only, never customer text.
5. **Closes the loop with Rovo Evaluations.** One click downloads the affected pairs as an Evaluations dataset. In our run the same 12 questions scored 92% before the edit and 33% after it. The 8 failures were exactly the 8 answers Golden Set had flagged before any evaluation ran. After applying the suggestions the score came back to 83%; the two remaining failures were the "three weeks" answer above and a question the help article never covered.
6. **Answers in Rovo chat.** The Golden Set agent answers "Which golden answers did the last article edit break?", shows the golden answers for an article, and hands over the re-test CSV.
7. **Lets admins stay in charge.** Admins can mark a pair "not golden", restore it, rewrite an expected answer, undo the rewrite, and accept an edit with or without the suggestions. Rewrites survive a rescan.

## How it differs from drift checkers

Several Codegeist entries compare a Confluence page with Jira work and flag when the two drift apart. Golden Set looks at a different pair: the article and the answers your customers already received. Its unit is a resolved request with a verified answer, and its output is a test set you can run in Rovo Evaluations. Release gates that read an agent evaluation report sit one step later: they judge the results of a run, and Golden Set supplies the dataset that run needs. On our demo the prediction came before the test run: Golden Set flagged 8 of the 12 answers that rely on Returns policy, and Evaluations then failed exactly those 8 (92% before the edit, 33% after).

## How we built it

- **Forge** with a JSM queue page (Custom UI, React), a Confluence byline item, a scheduled trigger, a Rovo agent with three read-only actions, an MCP server (rovo:mcp) that exposes the same actions as tools, and Forge KVS storage.
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

## Potential impact

On the demo set, one edit to one of six articles put 8 of the 50 golden answers at risk, and one of them needed a human to rewrite it. Golden Set finds this the moment the article is published, before a customer gets the old answer and before anyone runs an evaluation. The golden set itself costs nothing to build: every help desk already has the resolved requests, and Golden Set writes them down as the test set Rovo Evaluations needs.

## What we learned

- The test set is the hard part of evaluating an agent, not the runner.
- Help articles change in small, sensible edits, and those are the dangerous ones.
- Check the boring path on an empty site before you trust the demo.

## What's next for Golden Set

- Facts beyond numbers: renamed products, removed steps, new exceptions.
- More than one knowledge base space per project.
- A weekly digest for knowledge base owners: which articles carry the most tested answers.

## How it meets the technology requirement

Golden Set is a Forge app (manifest, Forge runtime, Forge KVS, scheduled trigger, Custom UI) that integrates with Jira Service Management (resolved requests, comments, satisfaction ratings, permissions), Confluence (articles, versions, page properties, byline item) and Rovo (rovo:agent with three rovo:action modules, and a rovo:mcp server with the same three tools), and its output is built for Rovo Agent Evaluations.

## Bonus prize write-up: Best Agents

The Golden Set agent is a Forge rovo:agent with three read-only rovo:action modules: list-article-impacts, get-article-pairs and get-retest-csv. Ask it "Which golden answers did the last article edit break?" and it names the article, the change ("30 days -> 14 days") and the answers that are likely outdated, with a suggested new answer for each. Ask for the re-test CSV and it returns a dataset ready for Rovo Evaluations. Each action runs as the asking user and answers only with requests, pages and spaces that user could open in Jira and Confluence.

## Bonus prize write-up: Best app with Atlassian MCP

Golden Set ships a rovo:mcp module named Golden Set. It exposes the three read-only actions as MCP tools: list-article-impacts, get-article-pairs and get-retest-csv. Any custom agent you build in Rovo Studio can add them, so the support agent that answers customers can also check which of its own tested answers an article edit just broke, and pull the re-test CSV before an Evaluations run. Once a site admin turns on external MCP exposure for the app, the same tools work in an outside client through https://mcp.atlassian.com/forge/c4b582c2-566a-4180-9837-2917cd0f3d87. The repository also ships an open-source skill file (skills/golden-set/SKILL.md) that tells a third-party agent when to call each tool and how to report the results. Every tool call runs with the caller's own permissions: it shows only requests, pages and spaces that person could open in Jira and Confluence. No tool writes anything. We checked this end to end on our demo site with the official MCP Inspector: after the Atlassian consent screen it listed the three tools and returned the same answers as the Golden Set page (12 golden answers for Returns policy, a 12-row re-test CSV, no open article edit).

## Testing instructions

Install link: https://developer.atlassian.com/console/install/c4b582c2-566a-4180-9837-2917cd0f3d87?signature=AYABeNQ3%2BbBT9DRlZpYUfyVY5RIAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBj%2BxACBeGAYnGRvmWSX1q1QAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDMlW2qRDxUPdBDWGsgIBEIA767C9s5ZV8WsDMgDCFiE4ZHWhin46GkbMUzLxG8FodWBpNDkIQDEplsDaeIPGiIK%2Ffs1xrJlliC5j%2FIAAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgGffwoLXEJlAO%2FYyyLciml6AAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMN1AajZ2d%2FXIZrDMBAgEQgDuZLQAUMl38aEszBOGKWPLdJLwEwObJiZVHcDUUXA9lcUeuq91QZvGUgPjTtNJ9RCpYRjb5kX6cN%2BwofQAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAeCO%2B%2B4NhOlFZyuS1uS3ma4AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwMMIz7FcV0t1f9g0ICARCAO5pEulk3HIENlSS0UefX%2BAdnyvJ4vGh7RIcD4ktf9SmHB3%2Fv2krRCXzS0vBipkevz6LmUIBIi8bGiAPVAgAAAAAMAAAQAAAAAAAAAAAAAAAAAEm3u0AB9lHR3UepVtOavAP%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJkn5CvzpO1v8QigXAZjxTcRY%2F7OM0Uo21ilQwJa9n16DqRXcAB57w%2Bj2IMQkWiXhtLFopy6etH31Fm6CxjMeRtZ98%3D&product=jira&product=confluence

Quick path (about 3 minutes of clicks plus about a minute and a half of waiting for demo data):

1. Install from the link above into Jira, and make sure Confluence is connected to the same installation.
2. In a test service project open Queues > Golden Set, pick a Confluence space, press Save, then Load demo data (Northwind Gear). It runs by itself for about 75 seconds. Then press Scan resolved requests: 80 read, 15 rejected, 5 duplicates, 50 golden pairs.
3. In section 3 press **Make the demo edit**: Golden Set changes "within 30 days of delivery" to "within 14 days of delivery" in the Returns policy article and checks it at once (you can also edit the article in Confluence by hand and reload). You see: 12 golden answers depend on this page, 8 likely outdated, and the smartwatch answer is marked Needs a person.

Full guide: docs/JUDGES.md in the repository: install, one-click demo data, a 10 minute walkthrough with the numbers you should see, and why each permission is needed.

Demo video: https://youtu.be/FUgnW8DuiIU (public on YouTube).

## Built with

forge, javascript, react, jira-service-management, confluence, rovo, forge-kvs
