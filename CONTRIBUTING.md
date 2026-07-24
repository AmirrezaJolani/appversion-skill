# Contributing to appversion

Thanks for helping out. This is a small, dependency-free project, so getting started is quick.

## Setup

```bash
git clone https://github.com/AmirrezaJolani/appversion-skill.git
cd appversion-skill
npm test
```

There is no install step — the project has **zero third-party dependencies** and uses Node's
built-in test runner. You need **Node.js ≥ 18**, `git`, and (only for the release path) `gh`.

## Project layout

```
skills/appversion/
├── SKILL.md              the procedure an agent follows (judgment + gates)
├── scripts/
│   ├── appversion.js     the CLI — all deterministic mechanics
│   └── trackers/         one read-only adapter per issue tracker
└── references/           schema, changelog format, tracker setup
commands/                 /appversion:<name> slash commands, one per system
test/                     node:test suite
.claude-plugin/ etc.      per-agent manifests (Claude, Gemini, Codex, Cursor, opencode, Copilot)
```

**The split that matters:** anything deterministic (version math, file writes, git/gh calls) belongs
in `scripts/appversion.js` where it can be unit-tested. Anything requiring judgment (which bump
level, changelog wording, when to ask the user) belongs in `SKILL.md`. Please keep that boundary —
it is why the tool is reliable.

## Ground rules

1. **Zero dependencies.** Node built-ins only (`fs`, `path`, `child_process`). If you think you need
   a package, open an issue first.
2. **Write the failing test first.** Every behavioral change needs a test that fails before your fix
   and passes after. Tests must exercise real behavior — temp dirs and real git repos, not mocks of
   our own code. (Mocking `fetch` in tracker adapter tests is fine and expected.)
3. **No shell strings for subprocesses.** Always `execFileSync('git', [...])` with an argv array —
   never an interpolated command string. There are currently zero `execSync` calls; keep it that way.
4. **`--dry-run` must write and execute nothing.** Every command that writes needs an explicit
   dry-run guard *and* a test asserting nothing changed. This has been the source of two real bugs,
   so it is checked closely in review.
5. **Nothing outward-facing without confirmation.** Pushing tags and creating GitHub Releases stay
   behind explicit invocation (and behind GATE 3 in `SKILL.md`). Don't add side effects to commands
   that currently only read.
6. **Trackers are read-only.** Adapters may fetch ticket data; they must never write, comment, or
   transition. Tokens come from environment variables only — never from config files or the repo.

## Making a change

```bash
git checkout -b fix/short-description
# write the failing test, then the fix
npm test
git commit -m "fix: what changed and why"
git push -u origin fix/short-description
gh pr create
```

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
`chore:`) — this project reads its own commit messages to decide version bumps, so the prefixes are
functional, not decorative. Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.

In your PR, please include what changed, why, and how you verified it.

## Adding a tracker adapter

The most common contribution. Each adapter is ~35 lines and self-contained:

1. Create `skills/appversion/scripts/trackers/<name>.js` exporting a factory:

   ```js
   module.exports = function createX(cfg) {
     return {
       name: 'x',
       keyPrefixes: cfg.keyPrefixes || [],
       detectIds(text) { /* return the ticket IDs found in text */ },
       async getTicket(id) { /* return { id, title, type, status, url, provider } or null */ },
     };
   };
   ```

2. Register it in `trackers/index.js` under `defaultAdapters`.
3. Add tests in `test/trackers.test.js` with an injected `fetch` stub: assert the request URL and
   auth header, the parsed `Ticket` shape, `detectIds` matching, and that errors/missing tokens
   return `null` rather than throwing.
4. Add `commands/<name>.md` documenting that provider's config shape, environment variables, and
   ticket-ID format.
5. Document it in `skills/appversion/references/tracker-integration.md`.

**`getTicket` must never throw.** Missing token, HTTP error, network failure → return `null`.
Enrichment is best-effort and must never block a release.

## Reporting bugs

Open an issue with: what you ran (the exact command), what you expected, what happened, and your
Node and git versions. A minimal repro in a scratch repo is the fastest path to a fix.
