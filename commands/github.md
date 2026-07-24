---
description: "Tag the current version and cut a GitHub Release"
---

# appversion: git tag + GitHub Release

Handle the **GitHub** side of releasing. Versioning the files is `/appversion:package`.

The helper script ships with this plugin at `skills/appversion/scripts/appversion.js`. Resolve its
absolute path once and call it `$APPVERSION`; run it against the user's project with `--path .`.

## What to do

1. **Check the version files first.**
   ```
   node "$APPVERSION" check --path .
   ```
   If this fails, stop and fix it (`/appversion:package`, or `sync`). Never tag a version whose
   `package.json` disagrees with `appversion.json`.

2. **Confirm what will be tagged.** `node "$APPVERSION" show version --path .` — the tag will be
   `v<version>`.

3. **Make sure the release commit exists** (version files + `CHANGELOG.md` committed), e.g.
   `git commit -m "chore(release): v<x.y.z>"`. The tag should point at that commit.

4. **Tag** — annotated, built from the current version:
   ```
   node "$APPVERSION" tag --message "<changelog section body>" --path .
   ```
   It refuses to overwrite an existing tag. Add `--push` to also push it.

5. **GitHub Release — outward-facing and effectively permanent. Confirm with the user first.**
   Preview it (prints the exact `gh` command, runs nothing):
   ```
   node "$APPVERSION" release --notes-file <file> --dry-run --path .
   ```
   Then, once the user approves:
   ```
   node "$APPVERSION" release --notes-file <file> --path .
   ```
   This pushes the tag and runs `gh release create`. Use the new CHANGELOG section body as the notes.

## Degrade gracefully

- No remote configured → create the local tag only; skip push + Release and say so.
- `gh` missing or unauthenticated (`gh auth status`) → skip the Release and print the manual command.
- Never push or create a Release without explicit confirmation.

## Tag vs Release

A **tag** is a git pointer to a commit — local until pushed, no notes, no notifications.
A **Release** is a GitHub publication wrapped around that tag, adding notes, assets, and watcher
notifications. You can tag without releasing; you cannot release without a tag.
