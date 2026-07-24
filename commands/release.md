---
description: "Run the full guided release: analyze commits, recommend a bump, update the changelog, tag, and cut the GitHub Release"
---

# appversion: full release

Run the complete release end to end. This composes `/appversion:package` (versioning) and
`/appversion:github` (tag + Release), with the changelog in between.

Follow the procedure in this plugin's `skills/appversion/SKILL.md` exactly, including its **three
confirmation gates**. The helper script is at `skills/appversion/scripts/appversion.js` — resolve its
absolute path as `$APPVERSION` and run it with `--path .`.

1. **Preflight** — confirm a git repo; locate `appversion.json` (offer `init` if missing, asking for
   the starting version rather than assuming `0.0.0`); determine the last version (latest `v*` tag ▸
   else `appversion.json` ▸ else `package.json`); warn and confirm if the working tree is dirty.

2. **Analyze** — list commits since the last version, group them by PR/branch, and classify each
   (`feat`→minor, `fix`→patch, `feat!` / `BREAKING CHANGE`→major). If `config.tracker` is set, pull
   ticket context: `git log <lastTag>..HEAD --pretty=%s%n%b | node "$APPVERSION" tickets --detect --path .`

3. **GATE 1** — present the **itemized recommendation**: every change with its level and a one-line
   reason, the tally, and the resulting version. Bump math is standard semver — the counts are
   rationale, the bump is a single step at the highest level present. **Wait for approval.**

4. **Apply** — `node "$APPVERSION" bump <level> --path .` (or `bump --auto` when the repo uses
   Conventional Commits). This also syncs `package.json`, every file in `config.json`, and badges.

5. **GATE 2** — build the `## [x.y.z] - YYYY-MM-DD` CHANGELOG section per
   `skills/appversion/references/changelog-format.md`, show it, and let the user edit the wording.

6. **Commit + tag** — commit the version files and CHANGELOG as `chore(release): v<x.y.z>`, then
   `node "$APPVERSION" tag --message "<section body>" --path .`

7. **GATE 3** — outward-facing and effectively permanent. Confirm, preview with
   `node "$APPVERSION" release --notes-file <file> --dry-run --path .`, then run it without
   `--dry-run` to push the tag and create the GitHub Release.

**Never** push or create a Release without passing GATE 3. If there is no remote, or `gh` is missing
or unauthenticated, do the local steps only and tell the user what to run manually.
