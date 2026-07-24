---
description: "Set up and verify Jira ticket enrichment for releases (read-only)"
---

# appversion: Jira

Wire Jira into the release flow so the bump recommendation and changelog use real ticket titles and
links instead of raw commit text. **Read-only** — this never writes to Jira, and never reads a local
Jira app; it only calls the Jira REST API for the ticket IDs found in the release range.

Script: `skills/appversion/scripts/appversion.js` in this plugin — resolve its absolute path as
`$APPVERSION` and run with `--path .`.

## 1. Configure

Add to `config.tracker` in the project's `appversion.json` (it accepts one object, or an array to use
several trackers at once):

```json
"tracker": {
  "provider": "jira",
  "host": "https://<your-org>.atlassian.net",
  "keyPrefixes": ["PROJ", "OPS"]
}
```

- `host` — your Jira base URL (**required**)
- `keyPrefixes` — the project keys whose issue IDs appear in your commits and branch names

## 2. Authenticate (environment variables only — never commit these)

```
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=<Atlassian API token>
```

## 3. Verify

Jira IDs look like `PROJ-123`. Test detection and fetching against real commits:

```
git log <lastTag>..HEAD --pretty=%s%n%b | node "$APPVERSION" tickets --detect --path .
```

Expect a JSON array of `{id,title,type,status,url,provider}`. An empty `[]` means: no tracker
configured, missing token, no matching IDs, or the API call failed — all non-fatal.

## 4. What it changes

Once configured, each item in the release recommendation is annotated
`[jira <ID> · <type> · <status>]`, and changelog entries link to `<host>/browse/<ID>`.
Enrichment is best-effort and never blocks a release.
