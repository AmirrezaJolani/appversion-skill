# Agent pointer

This repository is the `appversion` skill. Any coding agent can use it:

1. Read `SKILL.md` — it is the procedure, written as plain shell/git/gh steps.
2. Run the deterministic mechanics via `node scripts/appversion.js <command>`
   (`init`, `show`, `bump`, `build`, `status`, `tickets`).
3. Consult `references/` for the JSON schema, changelog format, and tracker configuration.

Nothing here is Claude-specific; the same files work under Gemini CLI, Copilot, opencode, or Codex.
