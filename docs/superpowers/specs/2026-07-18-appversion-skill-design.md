# AppVersion Skill — Design Spec

**Date:** 2026-07-18
**Status:** Approved for planning
**Author:** brainstormed with Claude Code

## 1. Overview

Build a self-contained, agent-portable skill named **`appversion`** that manages an
application's version the way the [AppVersion](https://www.npmjs.com/package/appversion)
CLI tool does — via an `appversion.json` file following [Semantic Versioning](http://semver.org/) —
but driven by an AI coding agent instead of manual CLI calls.

Given a repo, the skill:

1. Analyzes the commits since the last version.
2. Recommends a `major` / `minor` / `patch` bump **with reasoning** and waits for confirmation.
3. Applies the bump to `appversion.json`, `package.json`, and any other configured files.
4. Generates a changelog entry from the commits.
5. Commits the release, creates and pushes an annotated git tag, and cuts a GitHub Release.

The skill is **self-contained**: it does not require the `appversion` npm package to be
installed. It performs all mechanics itself.

## 2. Goals / Non-goals

**Goals**

- Reduce a release to a guided, reviewable conversation with clear stop points.
- Keep `appversion.json` faithful to the real AppVersion structure (version, status, build, commit, config).
- Produce a clean Keep a Changelog entry and a matching GitHub Release.
- Be deterministic and testable where it matters (the JSON/file mechanics).
- Run under multiple agents, with Claude Code as the first-class target.

**Non-goals**

- Reimplementing every AppVersion subcommand or its exact CLI flags.
- Building bespoke installers for Gemini / Copilot / opencode right now (portability is
  achieved by neutral writing + the shared script + a generic pointer; see §9).
- Publishing to npm or running the app's build system.
- Deciding release timing / branching strategy — the skill acts on the current branch.

## 3. Deliverable & repository layout

The deliverable is a skill package. In this repo (`appVersion/`):

```
appVersion/
├── SKILL.md                     # the procedure the agent follows (judgment + orchestration)
├── scripts/
│   └── appversion.js            # deterministic mechanics, Node, zero dependencies
├── references/
│   ├── appversion-schema.md     # appversion.json fields + semantics
│   └── changelog-format.md      # Keep a Changelog + conventional-commit mapping
├── test/
│   └── appversion.test.js       # node:test unit tests for the script
├── AGENTS.md                    # generic pointer so non-Claude agents can discover/run it
└── README.md                    # what it is + how to install
```

**Skill metadata** (`SKILL.md` frontmatter, Claude Code format):

- `name: appversion`
- `description:` "Use when the user wants to bump a version, cut a release, or tag a
  release — analyze commits since the last version, recommend and apply a semver bump to
  appversion.json + package.json, update the changelog, and create the git tag + GitHub Release."

## 4. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Relationship to the `appversion` npm tool | Skill does everything directly; no dependency on the tool |
| 2 | Structure | `SKILL.md` (judgment) + `scripts/appversion.js` (deterministic mechanics) + references |
| 3 | Autonomy | Propose a bump with reasoning, then confirm before writing |
| 4 | Analysis basis | Git commits since the last version; Conventional Commits mapped automatically, otherwise summarized/inferred |
| 5 | Git/GitHub actions | Commit the bump · create + push annotated tag · create GitHub Release · update CHANGELOG.md — all four |
| 6 | `appversion.json` scope | Full file: version + status + build + commit + config; created from template if missing |
| 7 | Portability | Claude Code first-class; agent-neutral prose + shared script + `AGENTS.md` pointer for other agents |

## 5. Workflow

```
Preflight  → confirm git repo; locate appversion.json (offer `init` from template if missing);
             determine "last version": latest v* tag ▸ else appversion.json ▸ else package.json.

Analyze    → git log <lastVersion>..HEAD; detect whether repo uses Conventional Commits.
             Conventional: feat!/BREAKING → major · feat → minor · fix/chore/... → patch.
             Non-conventional: summarize commits and infer intent.

┌─ GATE 1 ─ Present: current → proposed version, the level, and per-commit rationale.
│           Wait for explicit approval.
▼
Apply      → node scripts/appversion.js bump <level>
             (writes appversion.json, package.json, every file in config.json;
              refreshes badges in config.markdown; stamps commit hash).

Status     → (optional) if a pre-release/promotion is wanted: appversion.js status <stage> [n].

Changelog  → build a Keep a Changelog "## [x.y.z] - YYYY-MM-DD" section from the commits.
┌─ GATE 2 ─ Show the section; user approves/edits the wording.
▼
Commit     → stage changed files; commit "chore(release): vX.Y.Z".
Tag        → annotated tag vX.Y.Z (message = the changelog section).

┌─ GATE 3 ─ Outward-facing, effectively permanent. Confirm before touching the remote.
▼
Push+Rel   → git push (commit + tag); gh release create vX.Y.Z with the changelog section as notes.
```

**Why three gates.** They map to reversibility. Local file edits, the release commit, and
the local tag are cheap to reset, so they sit behind a single decision gate (the bump). Pushing
and creating a GitHub Release are outward-facing and effectively permanent, so they get their
own explicit gate. The skill never pushes or releases automatically.

## 6. Helper script API — `scripts/appversion.js`

Node, **zero dependencies**, subcommand CLI. Operates on `appversion.json` in the current
directory (or `--path <dir>`).

| Command | Behavior |
|---------|----------|
| `init` | Create `appversion.json` from the standard template if missing; no-op if present; prints path |
| `show [version\|status\|build\|commit\|full]` | Print the requested field(s); the app-facing "read your version" API (defaults to `full`) |
| `bump <major\|minor\|patch>` | Increment target field, zero lower fields; reset `build.number → 0`; stamp `commit` (HEAD short hash); propagate the new version into `package.json` and every file in `config.json`; refresh badges in every `config.markdown`. Prints the new version. Does **not** change status. |
| `build` | `build.number += 1`, `build.total += 1`, `build.date = today` |
| `status <stable\|rc\|beta\|alpha> [number]` | Set `status.stage` + `status.number` |

**Global flags:** `--path <dir>`, `--json` (machine-readable output for the SKILL to parse),
`--dry-run` (print planned writes, change nothing).

**Semantics**

- **Bump and build are distinct concepts.** A version bump resets `build.number` to `0`
  (new version, no builds yet) and leaves `build.total` untouched. Incrementing builds is the
  separate `build` command.
- **Date formats differ by purpose.** `build.date` uses AppVersion's `DD.MM.YYYY`; the changelog
  uses ISO `YYYY-MM-DD` (Keep a Changelog standard).
- **`commit` is stamped at bump time**, so it records the last real code commit — the
  `chore(release)` commit is created afterward. (Re-stamping the release commit is a possible
  future flag, not in scope now.)
- **Formatting is preserved:** JSON written with 2-space indent + trailing newline; only known
  fields are touched.
- **Version propagation:** `package.json` `version` is updated when the file exists; each path in
  `config.json` that carries a `version` field is updated; each `config.markdown` file has its
  version/status badge line rewritten. `config.ignore` folders are skipped during discovery.

## 7. `appversion.json` schema (reference summary)

Documented fully in `references/appversion-schema.md`. Template used by `init`:

```json
{
  "version": { "major": 0, "minor": 0, "patch": 0 },
  "status":  { "stage": null, "number": 0 },
  "build":   { "date": null, "number": 0, "total": 0 },
  "commit":  null,
  "config":  { "appversion": "x.y.z", "markdown": [], "json": [], "ignore": [] }
}
```

- `status.stage` ∈ `stable | rc | beta | alpha` (leading letter may be uppercase).
- `config.appversion` — schema version, used to detect an out-of-date file.
- `config.markdown` — markdown files whose version/status badges are kept in sync.
- `config.json` — other JSON files whose `version` field is kept in sync.
- `config.ignore` — folders to skip when searching/updating.

## 8. Changelog format — `references/changelog-format.md`

Keep a Changelog structure. A release adds a `## [x.y.z] - YYYY-MM-DD` section.

**Conventional-commit → category**

- `feat` → **Added**
- `fix` → **Fixed**
- `perf` / `refactor` / `style` → **Changed**
- `revert` → **Removed**
- `security` → **Security**
- `feat!` / any `BREAKING CHANGE` footer → surfaced at the top of the section as **⚠ Breaking Changes**
- `docs` / `chore` / `test` / `build` / `ci` → excluded by default

**Non-conventional repos:** read each commit message and bucket by meaning; anything ambiguous
goes under **Changed**.

Maintains link references at the bottom: `[x.y.z]: https://github.com/<owner>/<repo>/compare/vPrev...vX.Y.Z`
and the `[Unreleased]` link. The GitHub Release notes are the new section's body (heading stripped).

## 9. Portability across agents

- **Claude Code is the first-class install target:** `.claude/skills/appversion/SKILL.md`
  (project) and/or `~/.claude/skills/appversion/` (global), with YAML `name` + `description`.
- **Other agents are supported by portability, not bespoke installers:**
  - `SKILL.md` is written in agent-neutral language — steps are described as capabilities
    ("run `node scripts/appversion.js bump minor`", "create an annotated git tag", "read
    `CHANGELOG.md`") rather than Claude-specific tool names.
  - All exact mechanics live in `scripts/appversion.js`, invoked identically by any agent via a
    shell command, so behavior is byte-identical everywhere.
  - `AGENTS.md` gives a generic pointer any agent (Gemini, Copilot, opencode, Codex) can read to
    discover and run the skill manually.
- Dedicated Gemini/Copilot installers are explicitly out of scope for the first version and can
  be added later without changing the core.

## 10. Testing

- **The script is deterministic and unit-tested** with Node's built-in `node:test` + `node:assert`
  (zero dependencies, matching the script's philosophy).
- **Fixtures:** a temp directory with `appversion.json` + `package.json` + an extra config JSON +
  a README containing a badge line.
- **Cases:** each bump level's increment/reset behavior; `init` when missing (and no-op when
  present); propagation into `config.json` files; badge rewrite in a markdown fixture; `status`
  set; `build` increment; `--dry-run` writes nothing; malformed/missing JSON produces a clear
  error and non-zero exit; date/format correctness.
- **Judgment parts** (bump recommendation, changelog prose, `gh` calls) are not unit-tested;
  they are validated by a documented manual dry-run in a throwaway git repo.

## 11. Error handling & graceful degradation

Handled in the `SKILL.md` preflight and the script:

- Not a git repo → the script can still bump JSON with a placeholder `commit`; the SKILL warns.
- Dirty working tree → warn and confirm before proceeding.
- No remote configured → create the local tag only; skip push and Release, and say so.
- `gh` not installed / not authenticated → skip the GitHub Release; report what to run manually.
- No `package.json` → bump `appversion.json` (and any `config.json` targets) only.
- Malformed `appversion.json`, unknown command, invalid status stage, or invalid bump level →
  the script exits non-zero with a clear message.

## 12. Success criteria

- Running the skill on a repo with commits since the last tag produces: an updated
  `appversion.json` + `package.json`, a correct new CHANGELOG section, a `chore(release)` commit,
  an annotated `vX.Y.Z` tag, and (after confirmation) a pushed tag + GitHub Release.
- No outward-facing action (push, Release) happens without an explicit confirmation.
- `node --test` passes for `scripts/appversion.js`.
- The same `SKILL.md` + script runs unchanged under a second agent invoked via shell.

## 13. Risks / open questions

- **Exact AppVersion build/date conventions** (e.g. whether `build.number` truly resets on bump,
  precise date string) should be verified against the AppVersion README during implementation and
  adjusted if they differ from the assumptions above.
- **Badge line detection** in arbitrary markdown is heuristic; the first version targets a
  recognizable shields.io-style badge and may need a marker comment for robustness.
- **Monorepos / multiple `appversion.json`** are out of scope for v1 (single file at repo root).
