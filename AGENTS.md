# Agent pointer

This repository is the `appversion` skill. Any coding agent can use it:

1. Read `skills/appversion/SKILL.md` — it is the procedure, written as plain shell/git/gh steps.
2. Run the deterministic mechanics via
   `node skills/appversion/scripts/appversion.js <command> --path .`
   (`init`, `show`, `bump` [`--auto`], `build`, `status`, `tickets`, `check`, `sync`, `install-hook`,
   `tag`, `release`); `--path .` targets the user's project.
3. Consult `skills/appversion/references/` for the JSON schema, changelog format, and tracker configuration.

Nothing here is Claude-specific. Per-agent entry points live at the repo root:

| Agent | Entry point |
|-------|-------------|
| Claude Code | `.claude-plugin/plugin.json` (+ `marketplace.json`) — skill auto-discovered in `skills/` |
| Gemini CLI | `gemini-extension.json` + `GEMINI.md` (imports the SKILL) |
| Codex | `.codex-plugin/plugin.json` |
| Cursor | `.cursor-plugin/plugin.json` |
| opencode | `.opencode/INSTALL.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |

All of them point at the single source of truth in `skills/appversion/`.
