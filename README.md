# appversion skill

An agent skill that turns "cut a release" into a guided, reviewable flow: analyze commits since the
last version, recommend and apply a SemVer bump to `appversion.json` + `package.json`, update the
changelog, and create the git tag + GitHub Release. Optional read-only enrichment from Jira, Plane,
Shortcut, ClickUp, or Linear.

## Requirements
- Node.js ≥ 18 (uses `node:test` and global `fetch`; no third-party dependencies)
- `git`; `gh` (GitHub CLI) for the Release step

## Install (Claude Code)
```bash
ln -s "$(pwd)" ~/.claude/skills/appversion
```
Then invoke it by asking to bump/release a version.

## Use directly (any agent or by hand)
```bash
node scripts/appversion.js init
node scripts/appversion.js bump minor
node scripts/appversion.js show version
```

## Test
```bash
npm test   # == node --test
```

See `SKILL.md` for the full procedure and `references/` for schema, changelog, and tracker details.
