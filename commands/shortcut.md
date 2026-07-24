---
description: "Set up and verify Shortcut story enrichment for releases (read-only)"
---

# appversion: Shortcut

Wire Shortcut into the release flow so the bump recommendation and changelog use real story titles
and links instead of raw commit text. **Read-only** — this never writes to Shortcut, and never reads
local data; it only calls the Shortcut REST API for the story IDs found in the release range.

Script: `skills/appversion/scripts/appversion.js` in this plugin — resolve its absolute path as
`$APPVERSION` and run with `--path .`.

## 1. Configure

Add to `config.tracker` in the project's `appversion.json` (one object, or an array to use several
trackers at once):

```json
"tracker": {
  "provider": "shortcut"
}
```

No `host` and no `keyPrefixes` are needed — Shortcut stories are matched by their numeric `sc-` form,
not by a project key.

## 2. Authenticate (environment variable only — never commit this)

```
export SHORTCUT_API_TOKEN=<Shortcut API token>
```

## 3. Verify

Shortcut IDs are matched as `sc-1234` (case-insensitive). Reference stories that way in commits and
branch names — a bare `#1234` is deliberately **not** matched, so it can't collide with PR numbers.

```
git log <lastTag>..HEAD --pretty=%s%n%b | node "$APPVERSION" tickets --detect --path .
```

Expect a JSON array of `{id,title,type,status,url,provider}` — `type` is the story type (feature /
bug / chore) and `status` is `completed`, `started`, or `unstarted`. An empty `[]` means: no tracker
configured, missing token, no `sc-` references, or the API call failed — all non-fatal.

## 4. What it changes

Each item in the release recommendation is annotated `[shortcut <ID> · <type> · <status>]`, and
changelog entries link to the story's Shortcut URL. Enrichment is best-effort and never blocks a
release.
