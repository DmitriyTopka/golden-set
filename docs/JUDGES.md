# Golden Set: guide for judges

Golden Set shows which support answers break when someone edits a help article. It builds a set of verified question and answer pairs from resolved Jira Service Management requests, ties each pair to the Confluence article it relies on, and when that article changes it tells you which answers are now likely wrong. It also gives you a CSV to re-test an AI agent in Rovo Agent Evaluations.

Time needed: about 3 minutes to install, about 10 minutes to try everything with the demo data.

## What you need

- One Atlassian Cloud site with **Jira Service Management** and **Confluence**.
- A service project and a Confluence space you can use for testing. The demo data adds 6 help articles and 80 resolved requests, so please do not use a real project.
- You need to be a project administrator of that service project. To get demo customers on example.com addresses you also need to be a Jira admin; otherwise the demo requests are raised for the project's own customers (see "Demo data" below).
- Rovo is optional. Everything except the chat agent and Evaluations works without it.

## Install

1. Open the install link: `INSTALL_LINK` (filled in at submission).
2. Pick your site and install Golden Set into **Jira**.
3. Approve the connection to **Confluence** on the same site when asked. It is one installation: Jira and Confluence share it.

If the page says "Installation failed" in Jira, wait a minute and try again. We saw this once on a fresh site; the second attempt worked.

## Try it in 10 minutes

1. In your service project, open **Queues** in the project sidebar and pick **Golden Set** at the bottom of the queue list.
2. **1. Which knowledge base do agents answer from?** Pick your test Confluence space and press **Save**.
3. **2. Build the golden set.** Press **Load demo data (Northwind Gear)**. It takes 2 to 3 minutes. Then press **Scan resolved requests**.
   You should see: 80 resolved requests read, 15 rejected (reopened, complaint, low CSAT), 5 duplicates folded, 50 golden pairs across 7 articles.
4. Look at **4. Golden pairs**. Each answer comes from a resolved request. Golden Set replaces personal data with [email], [phone] and so on, and shows the article each pair relies on. Try the **Help article** filter, **Not golden**, and **Edit** on an answer.
5. Open the Confluence page **Returns policy** in your space. Change "within 30 days of delivery" to "within 14 days of delivery" and publish.
6. Back in Golden Set, reload the page (or pick the article and press **Check now**). Section **3. Article changes** says that 12 golden answers depend on this page and 8 are likely outdated, shows the change "30 days -> 14 days" and a suggested new answer for each.
   One answer (NS-2, "it arrived about three weeks ago") gets no suggestion and is marked **Needs a person**: changing only the number would flip its verdict. Rewrite it with **Edit**.
7. Press **Apply suggested answers and accept edit**, or **Download re-test CSV** first.
8. In Confluence, the line under the article title shows the Golden Set count, for example "Golden Set: 8 of 12 answers may be outdated".

### With Rovo (optional)

- Open Rovo chat, pick the **Golden Set** agent and ask: "Which golden answers did the last article edit break?", "Show the golden answers for Returns policy" or "Give me the re-test CSV for Returns policy". The agent only reads; it shows what you could see yourself in Jira.
- In Rovo Studio, open your support agent, **Evaluation > Create dataset**, upload the CSV and run **Response accuracy**. In our run the same 12 questions scored 92% before the edit and 33% after it: the 8 failures were the 8 answers Golden Set had flagged. After we applied the suggestions the score went back up to 83%.

## Demo data

- Creates 6 help articles in the space you picked (or reuses pages with the same titles) and 80 requests in the service project, resolved with public agent replies.
- If you are a Jira admin, Golden Set raises the requests for three demo customers on example.com. Without that right it uses the project's own customers, and Jira Service Management emails them. That is why we ask for a test project.
- We wrote all demo text ourselves. It contains no real customer data.

## Permissions, and why

| Scope | Why Golden Set needs it |
|---|---|
| read:servicedesk-request | read resolved requests, comments and satisfaction ratings |
| write:servicedesk-request, manage:servicedesk-customer | only for "Load demo data": raise demo requests and add demo customers |
| read:jira-work, write:jira-work | read status history and comment authors; demo data resolves and reopens requests |
| read:jira-user | check the project permissions of the person using the page |
| read:confluence-content.summary, read:page:confluence, read:space:confluence | read help articles and list spaces |
| write:page:confluence | save the count shown under an article (a page property, not the page text) and create demo articles |
| storage:app | keep the golden set inside the app's own Forge storage |

Golden Set has no external egress and runs no LLM of its own: selection, linking and the edit check are deterministic.

## Who sees what

- Changing anything (space, scan, demo data, Not golden, Edit, accepting edits) needs **Administer projects** in the service project.
- Reading the golden set needs **Browse projects** and access to the knowledge base space. People only see pairs for requests and pages they could open themselves.
- The line under a Confluence article shows only counts, never customer text.

## Known limits

- Golden Set works best when agents link the help article in their replies. It ties an answer without a link to an article by matching facts and marks it "by fact".
- It reads English best. The facts it compares are numbers, money, percentages and durations.
- Up to 50 pairs per project, re-test CSV files up to 100 rows (the Evaluations limit).
- Golden Set checks the articles every five minutes and each time an administrator opens the page.
