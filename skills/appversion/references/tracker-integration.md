# Issue-tracker integration (read-only)

The skill enriches the recommendation and changelog with ticket context. It **only** calls the
configured tracker's HTTPS API — it never reads a local tracker app, cache, or local data — and only
for ticket IDs found in the release range. If nothing is configured, the tracker layer does nothing.

## Configure in `appversion.json`

`config.tracker` is one object, or an array to sync several at once:

```json
"tracker": [
  { "provider": "jira",  "host": "https://acme.atlassian.net", "keyPrefixes": ["PROJ"] },
  { "provider": "plane", "host": "https://plane.acme.dev", "workspace": "acme", "keyPrefixes": ["APP"] }
]
```

Each detected ticket ID is routed to the provider whose `keyPrefixes` match it.

## Tokens (environment variables — never commit them)

| Provider | Env vars | Extra config |
|----------|----------|--------------|
| jira | `JIRA_EMAIL`, `JIRA_API_TOKEN` | `host` (base URL) |
| plane | `PLANE_API_TOKEN` | `host`, `workspace` |
| shortcut | `SHORTCUT_API_TOKEN` | — |
| clickup | `CLICKUP_API_TOKEN` | `keyPrefixes` for custom IDs (else matches `CU-…`) |
| linear | `LINEAR_API_KEY` | `keyPrefixes` (team keys) |

## ID formats

- jira / plane / linear: `PREFIX-123`
- shortcut: `sc-1234`
- clickup: `CU-abc123` or a configured custom prefix `ABC-123`

## Use it

```bash
# explicit ids
node scripts/appversion.js tickets PROJ-142 APP-88

# detect ids from piped text (branch names, commit log, PR body)
git log v1.2.0..HEAD --pretty=%s | node scripts/appversion.js tickets --detect
```

Output: `[{ id, title, type, status, url, provider }]`.

## Degradation

Missing config, unknown provider, missing token, or any HTTP/network error → that provider yields
nothing and the release proceeds using commit text. Enrichment never blocks a release.

Prefix collisions between two configured providers are unsupported (give each distinct `keyPrefixes`).
