---
name: appversion
description: Use when the user wants to bump a version, cut a release, or tag a release — analyze commits since the last version, recommend and apply a semver bump to appversion.json + package.json, update the changelog, and create the git tag + GitHub Release.
---

# AppVersion release skill

Manage an application's version (SemVer) via `appversion.json`, then changelog, tag, and GitHub
Release. Deterministic mechanics live in `scripts/appversion.js` (run it; do not reimplement its
math). This procedure is agent-neutral: every step is a shell command, a file read, or a git/gh
action.

## When to use
The user asks to bump a version, cut/tag a release, or "release vX".

## Procedure

### 1. Preflight
- Confirm you are in a git repo: `git rev-parse --is-inside-work-tree`.
- Ensure `appversion.json` exists: `node scripts/appversion.js show version --path .`
  If it errors, offer to create it: `node scripts/appversion.js init` — then ask the user for the
  starting version instead of assuming `0.0.0`.
- Determine the **last version**, in order: latest `v*` tag (`git describe --tags --match 'v*' --abbrev=0`),
  else `appversion.json`, else `package.json`.
- If the working tree is dirty (`git status --porcelain` non-empty), warn and confirm before continuing.

### 2. Analyze changes
- List commits since the last version: `git log <lastTag>..HEAD --pretty=format:'%h %s'` (all commits if no tag).
- Group them by PR/branch: prefer `(#N)` in squash-merge subjects or merge-commit messages; if `gh`
  is available, `gh pr list --state merged --search 'merged:>=<date>'` helps. If there is no PR
  structure, group by conventional-commit type.
- Detect Conventional Commits. Map `feat!`/`BREAKING CHANGE` → major, `feat` → minor, everything
  else (`fix`, `chore`, ...) → patch. If not conventional, read each commit and infer intent.
- **Tracker enrichment (optional).** If `appversion.json` has `config.tracker`, pull real ticket
  context so the recommendation and changelog use titles/types instead of raw commit text:
  `git log <lastTag>..HEAD --pretty=%s%n%b | node scripts/appversion.js tickets --detect`
  Also detect IDs in branch names and PR bodies. This is best-effort: on any error or with no
  tracker/token, skip it and use commit text (see `references/tracker-integration.md`).

### 3. Recommend (GATE 1)
Present an **itemized** recommendation and WAIT for explicit approval. Format:

```
Since <lastVersion> — <N> commits across <M> PRs/branches:

  <branch>  <summary>   → <level>   <one-line reason>
  ...

  Tally: <counts>
  → Recommended bump: <LEVEL> (highest level wins)
  → <old> → <new>

  Because: <plain-language rationale>. Proceed?
```

Bump math is **standard semver**: the itemized counts are rationale; the actual bump is a single
step at the highest level present. `major` (any breaking change) wins over any minors/patches.

When ticket context is available, annotate each item with `[<provider> <ID> · <type> · <status>]`
and route its changelog link to that provider's URL.

### 4. Apply the bump
After approval:
```
node scripts/appversion.js bump <level> --path .
```
This updates `appversion.json`, `package.json`, every file in `config.json`, and badges in
`config.markdown`, and stamps the commit hash.

For a pre-release or promotion, also run `node scripts/appversion.js status <stable|rc|beta|alpha> [n]`.

### 5. Changelog (GATE 2)
Build a new `## [x.y.z] - YYYY-MM-DD` section from the grouped commits, following
`references/changelog-format.md`. Create `CHANGELOG.md` with a standard header if missing; otherwise
prepend the new section and update the compare links. Show the section to the user and let them edit
the wording before continuing.

### 6. Commit + tag
```
git add appversion.json package.json CHANGELOG.md <any config.json/markdown files>
git commit -m "chore(release): v<x.y.z>"
git tag -a v<x.y.z> -m "<changelog section body>"
```

### 7. Push + Release (GATE 3)
This is outward-facing and effectively permanent. Confirm first, then:
```
git push && git push origin v<x.y.z>
gh release create v<x.y.z> --notes-file <file with the section body>
```

## Graceful degradation
- No remote → create the local tag only; skip push + Release; tell the user.
- `gh` missing/unauthenticated (`gh auth status`) → skip the Release; print the manual command.
- No `package.json` → the bump touches `appversion.json` (+ `config.json`) only.
- Never push or create a Release without passing GATE 3.
