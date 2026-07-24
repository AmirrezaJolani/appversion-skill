# AppVersion — Copilot instructions

This repository is the **appversion** agent skill. When the user asks to bump a version, cut a
release, or tag a release:

1. Follow the procedure in [`skills/appversion/SKILL.md`](../skills/appversion/SKILL.md) — it is
   written as plain shell / git / `gh` steps with three confirmation gates. Never push or create a
   GitHub Release without explicit confirmation (GATE 3).
2. Run the deterministic mechanics with the bundled zero-dependency Node script instead of
   reimplementing version math:
   ```
   node skills/appversion/scripts/appversion.js <init|show|bump|build|status|tickets|check|sync|install-hook|tag|release> --path .
   ```
   `--path .` targets the user's project (the current working directory).
3. Consult [`skills/appversion/references/`](../skills/appversion/references/) for the
   `appversion.json` schema, changelog format, and (optional, read-only) tracker configuration.

Requirements: Node.js ≥ 18, `git`, and `gh` for the Release step.
