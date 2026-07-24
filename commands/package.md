---
description: "Version the package files — bump appversion.json + package.json (and configured JSON/badges), or check and repair drift"
---

# appversion: package versioning

Handle the **package / version-file** side of releasing. Do **not** create tags or GitHub Releases
here — that is `/appversion:github`.

The helper script ships with this plugin at `skills/appversion/scripts/appversion.js`. Resolve its
absolute path once and call it `$APPVERSION`; run it against the user's project with `--path .`.

## What to do

1. **Show where things stand.**
   ```
   node "$APPVERSION" show version --path .
   node "$APPVERSION" check --path .
   ```
   `check` exits non-zero if `package.json` (or any file listed in `config.json`) has drifted from
   `appversion.json`.

2. **If the user wants a version bump:**
   - Read the commits since the last version tag and classify each change
     (`feat`→minor, `fix`→patch, `feat!` / `BREAKING CHANGE`→major).
   - Present an **itemized recommendation** — every change with its level and a one-line reason, the
     tally, and the resulting version — then WAIT for approval.
   - Apply it: `node "$APPVERSION" bump <major|minor|patch> --path .`
     Or, if the repo uses Conventional Commits and the user wants it decided for them:
     `node "$APPVERSION" bump --auto --path .`
   - Either way this also syncs `package.json`, every file in `config.json`, and the version/status
     badges in `config.markdown`, and stamps the commit hash.

3. **If `check` reported drift:** `node "$APPVERSION" sync --path .` rewrites those files to the
   current `appversion.json` version (no bump).

4. **Offer the guard** so it cannot happen again:
   `node "$APPVERSION" install-hook --path .` installs a pre-push hook that runs `check`, so a
   forgotten sync fails the push instead of shipping.

5. Pre-release stage: `node "$APPVERSION" status <stable|rc|beta|alpha> [n] --path .`
   Build counters: `node "$APPVERSION" build --path .`

Add `--dry-run` to any of these to preview without writing anything.

If `appversion.json` does not exist, offer `node "$APPVERSION" init --path .` — then ask the user for
the starting version rather than assuming `0.0.0`.
