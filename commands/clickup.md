---
description: "Set up and verify ClickUp task enrichment for releases (read-only)"
---

# appversion: ClickUp

Wire ClickUp into the release flow so the bump recommendation and changelog use real task titles and
links instead of raw commit text. **Read-only** — this never writes to ClickUp, and never reads local
data; it only calls the ClickUp REST API for the task IDs found in the release range.

Script: `skills/appversion/scripts/appversion.js` in this plugin — resolve its absolute path as
`$APPVERSION` and run with `--path .`.

## 1. Configure

Add to `config.tracker` in the project's `appversion.json` (one object, or an array to use several
trackers at once):

```json
"tracker": {
  "provider": "clickup",
  "keyPrefixes": ["ABC"]
}
```

- `keyPrefixes` — only needed if your team uses **custom task IDs** (e.g. `ABC-42`). Without it,
  native ClickUp IDs of the form `CU-8xy` are still matched automatically.

## 2. Authenticate (environment variable only — never commit this)

```
export CLICKUP_API_TOKEN=<ClickUp personal API token>
```

## 3. Verify

ClickUp IDs are matched as `CU-<id>` or as any configured custom prefix. Test against real commits:

```
git log <lastTag>..HEAD --pretty=%s%n%b | node "$APPVERSION" tickets --detect --path .
```

Expect a JSON array of `{id,title,type,status,url,provider}` — `status` is the task's ClickUp status
and `url` comes straight from the API. An empty `[]` means: no tracker configured, missing token, no
matching IDs, or the API call failed — all non-fatal.

## 4. What it changes

Each item in the release recommendation is annotated `[clickup <ID> · <type> · <status>]`, and
changelog entries link to the task URL. Enrichment is best-effort and never blocks a release.
