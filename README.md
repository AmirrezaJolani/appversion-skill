# appversion skill

An agent skill that turns "cut a release" into a guided, reviewable flow: analyze commits since the
last version, recommend and apply a SemVer bump to `appversion.json` + `package.json`, update the
changelog, and create the git tag + GitHub Release. Optional read-only enrichment from Jira, Plane,
Shortcut, ClickUp, or Linear.

The whole thing is one source of truth — `skills/appversion/` (SKILL.md + scripts + references) —
with thin per-agent adapters at the repo root, so the same skill runs under Claude Code, Gemini CLI,
Codex, Cursor, opencode, and GitHub Copilot.

## Requirements
- Node.js ≥ 18 (uses `node:test` and global `fetch`; no third-party dependencies)
- `git`; `gh` (GitHub CLI) for the Release step

## Install

**Claude Code — as a plugin (self-installing marketplace):**
```
npx skills add AmirrezaJolani/appversion-skill --skill appversion
```
(Run these from an interactive `claude` terminal.)

**Claude Code — as a plain skill (symlink):**
```bash
ln -s "$(pwd)/skills/appversion" ~/.claude/skills/appversion
```

**Other agents:** see the entry points listed in [`AGENTS.md`](AGENTS.md) —
`gemini-extension.json` + `GEMINI.md` (Gemini), `.codex-plugin/` (Codex), `.cursor-plugin/`
(Cursor), `.opencode/INSTALL.md` (opencode), `.github/copilot-instructions.md` (Copilot).

Then invoke it by asking to bump/release a version.

## Use directly (any agent or by hand)
```bash
node skills/appversion/scripts/appversion.js init --path .
node skills/appversion/scripts/appversion.js bump minor --path .
node skills/appversion/scripts/appversion.js show version --path .
```
`--path .` targets the project you are versioning (the current working directory).

## Test
```bash
npm test   # == node --test
```

See `skills/appversion/SKILL.md` for the full procedure and `skills/appversion/references/` for
schema, changelog, and tracker details.
