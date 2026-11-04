# Golden Set

See which support answers break when you edit a help article.

Golden Set is a Forge app for Jira Service Management and Confluence. It reads closed service requests, keeps the ones that were really solved (not reopened, no complaint, good CSAT when there is one), strips personal data and builds a golden set of up to 50 question and answer pairs. Every pair is tied to the help article it relies on. When someone edits that article, Golden Set lists the answers that are now likely wrong and gives you a CSV to re-test your agent in Rovo Agent Evaluations.

No LLM runs on our side: selection, linking and the edit check are deterministic, so they cost nothing and give the same result every time.

## Run the core locally

```
npm install
npm test
node seed/generate.mjs && node seed/verify.mjs
node tools/demo.mjs
```

The demo uses Northwind Gear, a fictional shop. All data is synthetic.

## License

MIT
