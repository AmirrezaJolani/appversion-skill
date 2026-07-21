# Installing AppVersion for opencode

## Prerequisites
- [opencode](https://opencode.ai) installed
- Node.js ≥ 18, `git`, and (for the Release step) `gh`

## How it works
opencode reads `AGENTS.md` at the repo root as project context. This repository's `AGENTS.md`
points the agent at the skill procedure (`skills/appversion/SKILL.md`) and the runnable helper
(`skills/appversion/scripts/appversion.js`). No opencode-specific runtime is required — the skill
is plain shell + git + `gh` steps plus a zero-dependency Node script.

## Use it in your project
1. Make the skill available where opencode runs — either clone this repo alongside your project, or
   copy `skills/appversion/` into it.
2. In an opencode session, ask to cut a release (e.g. "bump the version and update the changelog").
   Point the agent at the skill by referencing `AGENTS.md` or the `SKILL.md` path if needed.
3. The agent runs the mechanics with:
   ```
   node <path-to>/skills/appversion/scripts/appversion.js bump minor --path .
   ```
   where `--path .` targets your project (the working directory).

See `skills/appversion/references/` for the schema, changelog format, and tracker configuration.
