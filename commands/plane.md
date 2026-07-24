---
description: "Set up and verify Plane ticket enrichment for releases (read-only)"
---

# appversion: Plane

Wire Plane into the release flow so the bump recommendation and changelog use real issue titles and
links instead of raw commit text. **Read-only** — this never writes to Plane, and never reads local
data; it only calls the Plane REST API for the issue IDs found in the release range. Works with both
Plane Cloud and a self-hosted instance.

Script: `skills/appversion/scripts/appversion.js` in this plugin — resolve its absolute path as
`$APPVERSION` and run with `--path .`.

## 1. Configure

Add to `config.tracker` in the project's `appversion.json` (one object, or an array to use several
trackers at once):

```json
"tracker": {
  "provider": "plane",
  "host": "https://plane.example.com",
  "workspace": "<your-workspace-slug>",
  "keyPrefixes": ["APP"]
}
```

- `host` — your Plane base URL, cloud or self-hosted (**required**)
- `workspace` — the workspace slug (**required**)
- `keyPrefixes` — the project identifiers appearing in your commits/branches

## 2. Authenticate (environment variable only — never commit this)

```
export PLANE_API_TOKEN=<Plane API token>
```

## 3. Verify

Plane IDs look like `APP-88`. Test detection and fetching against real commits:

```
git log <lastTag>..HEAD --pretty=%s%n%b | node "$APPVERSION" tickets --detect --path .
```

Expect a JSON array of `{id,title,type,status,url,provider}` — `status` comes from the issue's state.
An empty `[]` means: no tracker configured, missing token, missing `host`/`workspace`, no matching
IDs, or the API call failed — all non-fatal.

## 4. What it changes

Each item in the release recommendation is annotated `[plane <ID> · <type> · <status>]`, and
changelog entries link into your Plane workspace. Enrichment is best-effort and never blocks a
release.
