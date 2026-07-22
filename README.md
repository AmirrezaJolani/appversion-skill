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
/plugin marketplace add AmirrezaJolani/appversion-skill
/plugin install appversion@appversion-skill
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

## Never forget again (automatic + enforced)

Two problems this solves directly — forgetting to update `package.json`, and not knowing the level:

```bash
# decide the level for me from conventional commits, and apply it (package.json included)
node skills/appversion/scripts/appversion.js bump --auto --path .

# fail loudly if package.json ever drifts from appversion.json (great in CI)
node skills/appversion/scripts/appversion.js check --path .

# repair drift; and install a pre-push hook so a forgotten sync blocks the push
node skills/appversion/scripts/appversion.js sync --path .
node skills/appversion/scripts/appversion.js install-hook --path .
```

`bump --auto` maps `feat`→minor, `fix`→patch, `feat!`/`BREAKING`→major. The `install-hook` guard is
read-only — it only blocks a push when versions are out of sync; it never bumps or pushes for you.

## Tag + GitHub Release

```bash
# create the annotated tag v<version> from appversion.json (won't clobber an existing tag)
node skills/appversion/scripts/appversion.js tag --push --path .

# push the tag + cut a GitHub Release (needs gh); preview first with --dry-run
node skills/appversion/scripts/appversion.js release --notes-file NOTES.md --dry-run --path .
node skills/appversion/scripts/appversion.js release --notes-file NOTES.md --path .
```

So the whole flow is scriptable end to end: `bump --auto` → commit → `tag` → `release`. The
outward-facing steps (`--push`, `release`) only run when you invoke them — nothing pushes or
releases on its own.

## Test
```bash
npm test   # == node --test
```

See `skills/appversion/SKILL.md` for the full procedure and `skills/appversion/references/` for
schema, changelog, and tracker details.
