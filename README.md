# appversion

An agent skill that turns "cut a release" into a guided, reviewable flow — and stops two specific
mistakes: **forgetting to update `package.json`**, and **guessing whether a change is major, minor,
or patch**.

It analyzes the commits since your last version, recommends a SemVer bump *with reasoning*, applies
it to `appversion.json` + `package.json` (and any other configured file), updates the changelog, and
creates the git tag + GitHub Release. Optional read-only enrichment from Jira, Plane, Shortcut,
ClickUp, or Linear.

One source of truth — `skills/appversion/` — with thin per-agent adapters at the repo root, so the
same skill runs under Claude Code, Gemini CLI, Codex, Cursor, opencode, and GitHub Copilot.

## Installation

Installation differs by harness. If you use more than one, install it separately for each.

### Claude Code

Register this repository as a plugin marketplace, then install the plugin:

```
/plugin marketplace add AmirrezaJolani/appversion-skill
/plugin install appversion@appversion-skill
```

Run these from an interactive `claude` terminal (`/plugin` opens a dialog).

Prefer no plugin system? Symlink the skill directly:

```bash
ln -s "$(pwd)/skills/appversion" ~/.claude/skills/appversion
```

### Other agents

| Agent | Entry point |
|-------|-------------|
| Gemini CLI | `gemini-extension.json` + `GEMINI.md` (imports the SKILL) |
| Codex | `.codex-plugin/plugin.json` |
| Cursor | `.cursor-plugin/plugin.json` |
| opencode | `.opencode/INSTALL.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |

All of them point at the same `skills/appversion/`. See [`AGENTS.md`](AGENTS.md).

## Requirements

- Node.js ≥ 18 (uses `node:test` and global `fetch`) — **no third-party dependencies**
- `git`; `gh` (GitHub CLI) for the Release step

## Use it

Ask your agent to cut a release ("bump the version", "release this"). It will analyze your commits
and show an itemized recommendation before changing anything:

```
Since v1.2.0 — 6 commits across 3 PRs/branches:

  feat/PROJ-142  CSV export            → minor   new capability, backward compatible
  feat/APP-88    Bulk user import      → minor   new capability, backward compatible
  fix/PROJ-151   Pagination off-by-one → patch   backward-compatible bug fix

  Tally: 2 minor-level features + 1 patch-level fix
  → Recommended bump: MINOR (highest level wins)   → v1.2.0 → v1.3.0
  Proceed?
```

## Commands

Everything is a plain CLI, so it works by hand, in CI, or driven by an agent.
`--path .` targets the project you are versioning.

| Command | What it does |
|---|---|
| `init` | Create `appversion.json` from the template |
| `show [version\|status\|build\|commit\|full]` | Read the current version/status/build/commit |
| `bump <major\|minor\|patch>` | Apply a bump; syncs `package.json`, configured JSON files, and badges |
| `bump --auto` | **Infer** the level from Conventional Commits since the last tag, then apply it |
| `build` | Increment build number/total and stamp the date |
| `status <stable\|rc\|beta\|alpha> [n]` | Set the release stage |
| `check` | Exit non-zero if `package.json`/config files drift from `appversion.json` |
| `sync` | Repair drifted files back to the current version |
| `install-hook` | Install a **pre-push hook** that runs `check` |
| `tag [--push] [--message <m>]` | Create the annotated `v<version>` tag (won't clobber an existing one) |
| `release [--notes <s>\|--notes-file <f>]` | Push the tag and create the GitHub Release (needs `gh`) |

Global flags: `--path <dir>`, `--json`, `--dry-run` (previews without writing anything).

## Never forget again

```bash
S=skills/appversion/scripts/appversion.js

# let it decide the level from your commits, and apply it (package.json included)
node $S bump --auto --path .

# fail loudly if package.json ever drifts (great in CI)
node $S check --path .

# or enforce it locally: a forgotten sync now blocks the push
node $S install-hook --path .
```

`bump --auto` maps `feat`→minor, `fix`→patch, `feat!`/`BREAKING`→major.

## Tag + GitHub Release

```bash
node $S tag --push --path .                                  # annotated v<version>, pushed
node $S release --notes-file NOTES.md --dry-run --path .     # preview the exact gh command
node $S release --notes-file NOTES.md --path .               # push tag + cut the Release
```

The full pipeline is scriptable: `bump --auto` → commit → `tag` → `release`. Outward-facing steps
(`--push`, `release`) only run when you invoke them — nothing pushes or releases on its own.

## Issue tracker enrichment (optional, read-only)

Configure `config.tracker` in `appversion.json` (one object, or an array to use several at once) and
ticket IDs found in your commits are resolved to real titles and links in the recommendation and
changelog. Tokens come from environment variables; the skill never reads a local tracker app.
See [`skills/appversion/references/tracker-integration.md`](skills/appversion/references/tracker-integration.md).

## Test

```bash
npm test   # == node --test
```

## Layout

```
skills/appversion/     SKILL.md + scripts/ + references/   ← the skill itself
.claude-plugin/        plugin.json + marketplace.json      ← Claude Code
test/                  node:test suite
```

See [`skills/appversion/SKILL.md`](skills/appversion/SKILL.md) for the full procedure and
`skills/appversion/references/` for the schema and changelog format.

## License

MIT — see [LICENSE](LICENSE).
