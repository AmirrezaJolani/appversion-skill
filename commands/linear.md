---
description: "Set up and verify Linear ticket enrichment for releases (read-only)"
---

# appversion: Linear

Wire Linear into the release flow so the bump recommendation and changelog use real issue titles and
links instead of raw commit text. **Read-only** — this never writes to Linear, and never reads a
local Linear app; it only calls the Linear GraphQL API for the issue IDs found in the release range.

Script: `skills/appversion/scripts/appversion.js` in this plugin — resolve its absolute path as
`$APPVERSION` and run with `--path .`.

## 1. Configure

Add to `config.tracker` in the project's `appversion.json` (one object, or an array to use several
trackers at once):

```json
"tracker": {
  "provider": "linear",
  "keyPrefixes": ["COR", "ACC"]
}
```

- `keyPrefixes` — your Linear **team keys** (the prefix in issue identifiers). No `host` needed.

## 2. Authenticate (environment variable only — never commit this)

```
export LINEAR_API_KEY=lin_api_<your key>
```

## 3. Verify

Linear IDs look like `COR-494`. Test detection and fetching against real commits:

```
git log <lastTag>..HEAD --pretty=%s%n%b | node "$APPVERSION" tickets --detect --path .
```

Expect a JSON array of `{id,title,type,status,url,provider}` — `type` comes from the issue's first
label, `status` from its workflow state, and `url` straight from Linear. An empty `[]` means: no
tracker configured, missing key, no matching IDs, or the API call failed — all non-fatal.

## 4. What it changes

Each item in the release recommendation is annotated `[linear <ID> · <type> · <status>]`, and
changelog entries link to the issue URL. Enrichment is best-effort and never blocks a release.
