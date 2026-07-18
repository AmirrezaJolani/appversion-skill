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

1. Analyzes the commits since the last version, **grouped by PR/branch**, and connects to the
   project's configured **issue tracker(s)** — any of Jira, Plane, Shortcut, ClickUp, or Linear,
   and more than one at a time — to pull real ticket context.
2. Produces an **itemized recommendation** — each change classified `major`/`minor`/`patch` with a
   reason — then states the aggregate bump and the version it lands on, and waits for confirmation.
3. Applies the bump to `appversion.json`, `package.json`, and any other configured files.
4. Generates a changelog entry from the commits, enriched with ticket titles and links.
5. Commits the release, creates and pushes an annotated git tag, and cuts a GitHub Release.

The skill is **self-contained**: it does not require the `appversion` npm package to be
installed. It performs all mechanics itself.

## 2. Goals / Non-goals

**Goals**

- Reduce a release to a guided, reviewable conversation with clear stop points.
- Keep `appversion.json` faithful to the real AppVersion structure (version, status, build, commit, config).
- Give a transparent, itemized bump recommendation the user can audit change-by-change.
- Enrich the recommendation and changelog with real issue-tracker context (read-only), from any of
  the supported trackers, including several configured at once.
- Produce a clean Keep a Changelog entry and a matching GitHub Release.
- Be deterministic and testable where it matters (the JSON/file mechanics and the tracker adapters).
- Run under multiple agents, with Claude Code as the first-class target.

**Non-goals**

- Reimplementing every AppVersion subcommand or its exact CLI flags.
- **Writing back to trackers** (commenting, transitioning, stamping fix-version) — read-only for v1;
  a documented future extension.
- Reading any local tracker desktop app or local tracker data — the skill only uses the configured
  tracker's remote API (see §10).
- Building bespoke installers for Gemini / Copilot / opencode right now (portability is
  achieved by neutral writing + the shared script + a generic pointer; see §11).
- Publishing to npm or running the app's build system.
- Monorepos / multiple `appversion.json` files (single file at repo root for v1).

## 3. Deliverable & repository layout

The deliverable is a skill package. In this repo (`appVersion/`):

```
appVersion/
├── SKILL.md                        # the procedure the agent follows (judgment + orchestration)
├── scripts/
│   ├── appversion.js               # deterministic version mechanics, Node, zero dependencies
│   └── trackers/
│       ├── index.js                # TrackerProvider interface + registry/routing by key prefix
│       ├── jira.js                 # per-provider adapters (read-only)
│       ├── plane.js
│       ├── shortcut.js
│       ├── clickup.js
│       └── linear.js
├── references/
│   ├── appversion-schema.md        # appversion.json fields + semantics
│   ├── changelog-format.md         # Keep a Changelog + conventional-commit mapping
│   └── tracker-integration.md      # config, tokens, per-provider ID formats & APIs
├── test/
│   ├── appversion.test.js          # node:test unit tests for the version script
│   └── trackers.test.js            # node:test unit tests for adapters + routing (mocked fetch)
├── AGENTS.md                       # generic pointer so non-Claude agents can discover/run it
└── README.md                       # what it is + how to install
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
| 2 | Structure | `SKILL.md` (judgment) + `scripts/appversion.js` (mechanics) + `scripts/trackers/*` (adapters) + references |
| 3 | Autonomy | Propose an itemized bump with reasoning, then confirm before writing |
| 4 | Analysis basis | Git commits since the last version, grouped by PR/branch; Conventional Commits mapped automatically, otherwise summarized/inferred |
| 5 | Bump math | **Standard semver** — itemize every change and level, but apply ONE bump at the highest level (no cumulative counts) |
| 6 | Git/GitHub actions | Commit the bump · create + push annotated tag · create GitHub Release · update CHANGELOG.md — all four |
| 7 | `appversion.json` scope | Full file: version + status + build + commit + config; created from template if missing |
| 8 | Tracker integration | **Read-only** enrichment via the configured tracker(s) — Jira / Plane / Shortcut / ClickUp / Linear, one or several at once; remote API only, optional and gracefully degrading |
| 9 | Portability | Claude Code first-class; agent-neutral prose + shared scripts + `AGENTS.md` pointer for other agents |

## 5. Change analysis & recommendation format

This is the heart of the "explain the bump" requirement. After determining the last version, the
skill:

1. **Collects commits** in `<lastVersion>..HEAD`.
2. **Groups them by PR/branch** — via `(#N)` references in squash-merge subjects, merge-commit
   messages, or `gh pr list` for the range. If no PR structure exists (direct commits), it groups
   by ticket ID, then falls back to grouping by conventional-commit type.
3. **Detects ticket IDs** (branch names, commit messages, PR bodies) and **fetches ticket context**
   from the configured tracker(s) (§10) — real titles, types, and status. Each ID is routed to the
   provider whose key prefixes match it, so different tickets in the same release can come from
   different trackers. Enrichment is best-effort: if unavailable, it proceeds using commit text.
4. **Classifies each group** as `major` / `minor` / `patch` with a one-line reason.
5. **Applies standard-semver math:** the recommended bump is a single step at the **highest** level
   present. The itemized counts (e.g. "2 minor + 1 patch") are shown as *rationale*, not summed into
   the version number.

**Example — recommendation at Gate 1 (resolves to MINOR):**

```
Since v1.2.0 — 6 commits across 3 PRs/branches:

  feat/PROJ-142  CSV export            [Jira PROJ-142 · Story · Done]    → minor
      new user-facing capability, backward compatible
  feat/APP-88    Bulk user import      [Plane APP-88 · Feature · Done]   → minor
      new user-facing capability, backward compatible
  fix/PROJ-151   Pagination off-by-one [Jira PROJ-151 · Bug · Done]      → patch
      backward-compatible bug fix

  Tally: 2 minor-level features + 1 patch-level fix
  → Recommended bump: MINOR (highest level wins)
  → v1.2.0 → v1.3.0

  Because: two features (CSV export, bulk import) add functionality without
  breaking existing behavior; the pagination fix alone would only be a patch.
  Proceed?
```

**Example — a patch-only release (resolves to PATCH):**

```
Since v1.3.0 — 2 commits on 1 PR/branch:

  fix/CU-4d2a  Crash on empty search  [ClickUp CU-4d2a · Bug · Done]  → patch
      backward-compatible bug fix
  fix/CU-4e01  Wrong total in footer  [ClickUp CU-4e01 · Bug · Done]  → patch
      backward-compatible bug fix

  Tally: 2 patch-level fixes (no features, no breaking changes)
  → Recommended bump: PATCH
  → v1.3.0 → v1.3.1

  Because: only backward-compatible bug fixes since v1.3.0; nothing adds or
  changes functionality, so a minor or major bump isn't warranted.
  Proceed?
```

A `major` appears when any group is a breaking change (`feat!`, `BREAKING CHANGE`, or a detected
removed/renamed public API described in a ticket/commit); it wins over any number of minors/patches.

## 6. Workflow

```
Preflight  → confirm git repo; locate appversion.json (offer `init` from template if missing);
             determine "last version": latest v* tag ▸ else appversion.json ▸ else package.json;
             load config.tracker (one or more) + tokens from env (if present).

Analyze    → git log <lastVersion>..HEAD; group by PR/branch; detect ticket IDs;
             route + fetch ticket context (best-effort); classify each group; build the itemized
             recommendation (§5).

┌─ GATE 1 ─ Present the itemized recommendation + resulting version. Wait for approval.
▼
Apply      → node scripts/appversion.js bump <level>
             (writes appversion.json, package.json, every file in config.json;
              refreshes badges in config.markdown; stamps commit hash).

Status     → (optional) if a pre-release/promotion is wanted: appversion.js status <stage> [n].

Changelog  → build a Keep a Changelog "## [x.y.z] - YYYY-MM-DD" section from the grouped commits,
             enriched with ticket titles + links.
┌─ GATE 2 ─ Show the section; user approves/edits the wording.
▼
Commit     → stage changed files; commit "chore(release): vX.Y.Z".
Tag        → annotated tag vX.Y.Z (message = the changelog section).

┌─ GATE 3 ─ Outward-facing, effectively permanent. Confirm before touching the remote.
▼
Push+Rel   → git push (commit + tag); gh release create vX.Y.Z with the changelog section as notes.
```

**Why three gates.** They map to reversibility. Local file edits, the release commit, and the local
tag are cheap to reset, so they sit behind a single decision gate (the bump). Pushing and creating a
GitHub Release are outward-facing and effectively permanent, so they get their own explicit gate.
Tracker access is read-only, so it adds no gate. The skill never pushes or releases automatically.

## 7. Helper script API — `scripts/appversion.js`

Node, **zero dependencies**, subcommand CLI. Operates on `appversion.json` in the current
directory (or `--path <dir>`).

| Command | Behavior |
|---------|----------|
| `init` | Create `appversion.json` from the standard template if missing; no-op if present; prints path |
| `show [version\|status\|build\|commit\|full]` | Print the requested field(s); the app-facing "read your version" API (defaults to `full`) |
| `bump <major\|minor\|patch>` | Increment target field, zero lower fields; reset `build.number → 0`; stamp `commit` (HEAD short hash); propagate the new version into `package.json` and every file in `config.json`; refresh badges in every `config.markdown`. Prints the new version. Does **not** change status. |
| `build` | `build.number += 1`, `build.total += 1`, `build.date = today` |
| `status <stable\|rc\|beta\|alpha> [number]` | Set `status.stage` + `status.number` |
| `tickets [--detect] [<id...>]` | With `--detect`, read text on stdin and extract IDs using each configured provider's pattern; otherwise use the given IDs. Route each ID to its provider, fetch it, and print `{id,title,type,status,url,provider}[]` as JSON. Encapsulates all tracker detection + HTTP so any agent gets identical behavior. |

**Global flags:** `--path <dir>`, `--json` (machine-readable output for the SKILL to parse),
`--dry-run` (print planned writes, change nothing).

**Semantics**

- **Bump and build are distinct concepts.** A version bump resets `build.number` to `0`
  (new version, no builds yet) and leaves `build.total` untouched. Incrementing builds is the
  separate `build` command.
- **Date formats differ by purpose.** `build.date` uses AppVersion's `DD.MM.YYYY`; the changelog
  uses ISO `YYYY-MM-DD` (Keep a Changelog standard).
- **`commit` is stamped at bump time**, so it records the last real code commit — the
  `chore(release)` commit is created afterward.
- **Formatting is preserved:** JSON written with 2-space indent + trailing newline; only known
  fields are touched.
- **Version propagation:** `package.json` `version` is updated when the file exists; each path in
  `config.json` that carries a `version` field is updated; each `config.markdown` file has its
  version/status badge line rewritten. `config.ignore` folders are skipped during discovery.

## 8. `appversion.json` schema (reference summary)

Documented fully in `references/appversion-schema.md`. Template used by `init`:

```json
{
  "version": { "major": 0, "minor": 0, "patch": 0 },
  "status":  { "stage": null, "number": 0 },
  "build":   { "date": null, "number": 0, "total": 0 },
  "commit":  null,
  "config":  { "appversion": "x.y.z", "markdown": [], "json": [], "ignore": [], "tracker": null }
}
```

- `status.stage` ∈ `stable | rc | beta | alpha` (leading letter may be uppercase).
- `config.appversion` — schema version, used to detect an out-of-date file.
- `config.markdown` — markdown files whose version/status badges are kept in sync.
- `config.json` — other JSON files whose `version` field is kept in sync.
- `config.ignore` — folders to skip when searching/updating.
- `config.tracker` — issue-tracker config: a single object **or an array** (one entry per tracker);
  `null` disables enrichment. See §10.

## 9. Changelog format — `references/changelog-format.md`

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

**Ticket enrichment:** when a change resolves a ticket, the entry uses the ticket title and links
it to the right tracker (e.g. `- Add CSV export ([PROJ-142](https://acme.atlassian.net/browse/PROJ-142))`).

Maintains link references at the bottom: `[x.y.z]: https://github.com/<owner>/<repo>/compare/vPrev...vX.Y.Z`
and the `[Unreleased]` link. The GitHub Release notes are the new section's body (heading stripped).

## 10. Issue-tracker integration (read-only) — `references/tracker-integration.md`

**Remote API only — never local.** The skill does not read any local tracker desktop app, cache, or
local data. It calls the configured tracker's HTTPS API, with a token supplied via an environment
variable, and only for the specific ticket IDs found in the release range. If nothing is configured,
the tracker layer does nothing.

**Provider abstraction.** One interface, thin adapters:

```
interface TrackerProvider {
  name: "jira" | "plane" | "shortcut" | "clickup" | "linear"
  detectIds(text): string[]                 // provider-specific ID pattern
  getTicket(id): Promise<Ticket | null>     // { id, title, type, status, url }
}
```

The release flow only ever talks to the interface, so adding/removing a provider never touches the
core, and each adapter is independently unit-testable.

**Provider selection is config-driven, not guessed, and supports several at once.** Because
providers share the `ABC-123` ID shape, detection alone is ambiguous. `appversion.json` declares the
tracker(s) — one object, or an array to sync several simultaneously:

```json
"tracker": [
  { "provider": "jira",  "host": "https://acme.atlassian.net", "keyPrefixes": ["PROJ"] },
  { "provider": "plane", "host": "https://plane.acme.dev", "workspace": "acme", "keyPrefixes": ["APP"] }
]
```

When multiple providers are configured, each detected ticket ID is **routed to the provider whose
`keyPrefixes` match it** (`index.js` registry), so one release can pull tickets from Jira, Plane,
ClickUp, etc. at the same time. A single object is accepted for the common one-tracker case.

**Tokens come from environment variables, never the repo:** `JIRA_API_TOKEN` (+ `JIRA_EMAIL`, host
from config), `PLANE_API_TOKEN` (+ host/workspace), `SHORTCUT_API_TOKEN`, `CLICKUP_API_TOKEN`,
`LINEAR_API_KEY`. Exact names are pinned in the reference doc.

**Per-provider notes** (detail in the reference doc):

- **Jira** — REST v3; IDs `PROJ-123`; needs base URL + email + API token (basic auth).
- **Plane** — REST (self-hostable); IDs `PROJ-123`; needs host + workspace.
- **Shortcut** — REST; story IDs `sc-1234` / `#1234`.
- **ClickUp** — REST; task IDs `CU-abc` or custom `ABC-123`.
- **Linear** — GraphQL API; IDs `TEAM-123`.

**Optional & gracefully degrading.** No `config.tracker`, unknown provider, missing token, or any
network/HTTP error → the skill skips that provider's enrichment, warns once, and continues the
release using commit text. Enrichment never blocks a release.

## 11. Portability across agents

- **Claude Code is the first-class install target:** `.claude/skills/appversion/SKILL.md`
  (project) and/or `~/.claude/skills/appversion/` (global), with YAML `name` + `description`.
- **Other agents are supported by portability, not bespoke installers:**
  - `SKILL.md` is written in agent-neutral language — steps are described as capabilities
    ("run `node scripts/appversion.js bump minor`", "create an annotated git tag", "read
    `CHANGELOG.md`") rather than Claude-specific tool names.
  - All exact mechanics — version math **and** tracker HTTP — live in the `scripts/` folder,
    invoked identically by any agent via a shell command, so behavior is byte-identical everywhere.
  - `AGENTS.md` gives a generic pointer any agent (Gemini, Copilot, opencode, Codex) can read to
    discover and run the skill manually.
- Dedicated Gemini/Copilot installers are explicitly out of scope for the first version and can
  be added later without changing the core.

## 12. Testing

- **Deterministic parts are unit-tested** with Node's built-in `node:test` + `node:assert`
  (zero dependencies, matching the scripts' philosophy).
- **Version script fixtures:** a temp directory with `appversion.json` + `package.json` + an extra
  config JSON + a README badge line. Cases: each bump level's increment/reset behavior; `init` when
  missing (and no-op when present); propagation into `config.json` files; badge rewrite; `status`;
  `build`; `--dry-run` writes nothing; malformed/missing JSON → clear error + non-zero exit;
  date/format correctness.
- **Tracker adapters + routing:** injected/mocked `fetch`; assert each adapter builds the right URL +
  auth headers and parses a sample response into the common `Ticket` shape; assert `detectIds`
  matches the provider's ID format; assert the registry routes an ID to the provider whose
  `keyPrefixes` match it, including a multi-provider config; assert graceful `null`/skip on
  401/404/network error.
- **Judgment parts** (PR grouping, per-change classification, changelog prose, `gh`) are not
  unit-tested; validated by a documented manual dry-run in a throwaway git repo.

## 13. Error handling & graceful degradation

Handled in the `SKILL.md` preflight and the scripts:

- Not a git repo → the version script can still bump JSON with a placeholder `commit`; the SKILL warns.
- Dirty working tree → warn and confirm before proceeding.
- No remote configured → create the local tag only; skip push and Release, and say so.
- `gh` not installed / not authenticated → skip the GitHub Release; report what to run manually.
- No `package.json` → bump `appversion.json` (and any `config.json` targets) only.
- No tracker config / missing token / tracker HTTP error → skip that provider's enrichment, warn
  once, continue.
- Malformed `appversion.json`, unknown command, invalid status stage, or invalid bump level →
  the script exits non-zero with a clear message.

## 14. Success criteria

- Running the skill on a repo with commits since the last tag produces: an **itemized**
  recommendation (each PR/branch classified, ticket-enriched where possible, resolved to a single
  standard-semver bump), and — after confirmation — an updated `appversion.json` + `package.json`,
  a correct new CHANGELOG section, a `chore(release)` commit, an annotated `vX.Y.Z` tag, and (after
  the outward-facing confirmation) a pushed tag + GitHub Release.
- No outward-facing action (push, Release) happens without an explicit confirmation.
- With one or more configured trackers + tokens, changelog entries and the recommendation show real
  ticket titles/links, each routed to its own tracker; with none, the release still completes.
- `node --test` passes for `scripts/appversion.js` and the tracker adapters/routing.
- The same `SKILL.md` + scripts run unchanged under a second agent invoked via shell.

## 15. Risks / open questions

- **Exact AppVersion build/date conventions** (whether `build.number` truly resets on bump, precise
  date string) to verify against the AppVersion README during implementation.
- **Tracker API differences & auth** vary per provider; the reference doc must pin exact endpoints,
  auth schemes, and ID patterns. Rate limits and pagination are out of scope beyond single-ticket
  fetches.
- **ID routing** relies on each configured provider declaring distinct `keyPrefixes`; multiple
  trackers are supported this way. Prefix collisions between two configured providers are the one
  unsupported case (documented as a limitation).
- **Badge line detection** in arbitrary markdown is heuristic; the first version targets a
  recognizable shields.io-style badge and may need a marker comment for robustness.
- **PR grouping** depends on `(#N)` references or `gh`; without either, the skill falls back to
  ticket-ID or conventional-type grouping.
