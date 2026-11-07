---
name: golden-set
description: Check which tested support answers a help article edit broke, and get a re-test dataset for Rovo Evaluations. Use with the Golden Set MCP server (Atlassian Forge app) when someone edits a Confluence help article, asks whether the support agent still answers correctly, or prepares an agent evaluation run.
---

# Golden Set

Golden Set is a Forge app for Jira Service Management and Confluence. It keeps a set of verified question and answer pairs taken from resolved service requests, and ties each pair to the help article it relies on. When an article changes, it marks the answers that are now likely wrong.

This skill tells an agent how to use the three Golden Set tools well. All three are read-only. They run with the permissions of the person who connected the MCP server, so they only return requests, pages and spaces that person could open in Jira and Confluence.

## Connect

1. A site admin turns on MCP access for the app: Atlassian Administration > Apps > Sites > your site > Connected apps > golden-set-app > Tools > Enable tools.
2. Add the remote MCP server to your client (Streamable HTTP): `https://mcp.atlassian.com/forge/c4b582c2-566a-4180-9837-2917cd0f3d87`
3. Sign in on the Atlassian consent screen and pick the site.

Tool names can carry an environment suffix, for example `list-article-impacts_development`. Treat them as the same tool.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `list-article-impacts` | `articleTitle` (optional) | Each edited article: the change (for example `30 days -> 14 days`), how many golden answers rely on it, the answers that are likely outdated with a suggested new answer, and the ones to re-check. Or a sentence saying no article changed. |
| `get-article-pairs` | `articleTitle` (required) | The golden question and answer pairs that rely on that article, up to 50, with the request key and project. |
| `get-retest-csv` | `articleTitle` (required) | A CSV with `prompt` and `expected_response` columns, up to 100 rows, ready to upload as a Rovo Evaluations dataset. |

Article titles match loosely: "returns" finds "Returns policy".

## When to call what

- Someone says a help article changed, or asks "did that edit break anything?": call `list-article-impacts`. Lead with the article and the change, then the count ("8 of 12 answers likely outdated"), then list each outdated answer with its suggested replacement.
- Someone asks what the support agent is expected to say about a topic: call `get-article-pairs` with the article title.
- Someone wants to re-test their agent after an edit: call `get-retest-csv` and give the CSV in a code block. Tell them to save it as a `.csv` file and upload it in Rovo Studio: the agent, Evaluation, Create dataset, then run Response accuracy.

## Rules

- Report only what the tools return. Do not invent requests, answers or numbers.
- Some outdated answers come with no suggestion and a `note`. That happens when the verdict depends on elapsed time, for example "the watch arrived three weeks ago, so you are still in time". Swapping one number would flip the meaning. Say a person should rewrite that answer, and do not write one yourself.
- The tools cannot change anything. To apply suggested answers or accept an edit, send the user to the Golden Set page in the service project (Queues > Golden Set). That needs Administer projects.
- If a tool says there is no golden set yet, a project admin has to open the Golden Set page and run a scan first.

## Example

User: "We changed the returns window last night. Did that break our support answers?"

Call `list-article-impacts`. A good reply:

> Returns policy changed from 30 days to 14 days. 12 golden answers rely on this article, and 8 now state the old window. Suggested fixes: NS-3 "The return window is 14 days from delivery." ... NS-2 (smartwatch, arrived three weeks ago) needs a person: with 14 days the customer is now too late, so the answer has to be rewritten, not edited. Want the re-test CSV for Evaluations?
