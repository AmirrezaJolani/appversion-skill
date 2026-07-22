# AppVersion Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, agent-portable `appversion` skill that analyzes commits, recommends and applies a semver bump to `appversion.json` + `package.json`, updates the changelog, and cuts a tagged GitHub Release — with optional, read-only issue-tracker enrichment across Jira/Plane/Shortcut/ClickUp/Linear.

**Architecture:** A `SKILL.md` owns judgment and orchestration (analysis, recommendation, changelog prose, git/gh, confirmation gates); a zero-dependency Node script `scripts/appversion.js` owns deterministic mechanics (JSON math, propagation, badges); `scripts/trackers/*` provide a `TrackerProvider` interface plus thin per-provider adapters behind a routing registry. The skill degrades gracefully — no tracker, no `gh`, no remote all still yield a valid local release.

**Tech Stack:** Node.js ≥18 (global `fetch`, `node:test`, `node:assert`), CommonJS, git, GitHub CLI (`gh`). No third-party dependencies.

**Reference spec:** `docs/superpowers/specs/2026-07-18-appversion-skill-design.md`

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `package.json` | Test runner + engines metadata for the skill's own suite. No runtime deps. |
| `scripts/appversion.js` | Deterministic CLI: `init`, `show`, `bump`, `build`, `status`, `tickets`; version math; propagation to `package.json`/`config.json`; badge refresh. Exports pure functions for unit tests. |
| `scripts/trackers/index.js` | `TrackerProvider` registry: build providers from config, detect + route ticket IDs, fetch tickets. |
| `scripts/trackers/{jira,plane,shortcut,clickup,linear}.js` | One read-only adapter each: `detectIds` + `getTicket` over the provider's HTTPS API. |
| `references/appversion-schema.md` | `appversion.json` field semantics. |
| `references/changelog-format.md` | Keep a Changelog + conventional-commit mapping. |
| `references/tracker-integration.md` | Tracker config, env tokens, per-provider endpoints/ID formats. |
| `SKILL.md` | The agent-facing procedure (Phase 1 core; Phase 2 wires enrichment). |
| `README.md` | What it is + install (symlink into `~/.claude/skills/appversion/`). |
| `AGENTS.md` | Generic pointer for non-Claude agents. |
| `test/appversion.test.js` | Unit/integration tests for the version script. |
| `test/trackers.test.js` | Unit tests for adapters + routing (mocked `fetch`). |

**Module conventions (apply to every code task):**
- CommonJS (`require` / `module.exports`).
- Each source file ends with `module.exports = { ... }`; the CLI entry ends with `if (require.main === module) main(process.argv);`.
- Ticket object shape everywhere: `{ id, title, type, status, url, provider }`.
- JSON is always written via `writeJson` (2-space indent + trailing newline).

---

# PHASE 1 — Core release skill (ships working software without trackers)

## Task 1: Repo scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "appversion-skill",
  "version": "0.1.0",
  "private": true,
  "description": "Agent skill: analyze commits, bump semver in appversion.json, update changelog, tag, and cut a GitHub Release.",
  "engines": { "node": ">=18" },
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Verify Node version**

Run: `node --version`
Expected: `v18.x` or higher (needed for `node:test` and global `fetch`).

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold appversion skill package"
```

---

## Task 2: `init` + JSON I/O + template

**Files:**
- Create: `scripts/appversion.js`
- Create: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — create `test/appversion.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const av = require('../scripts/appversion.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'av-'));
}

test('init creates appversion.json from template when missing', () => {
  const dir = tmp();
  const created = av.initFile(dir);
  assert.strictEqual(created, true);
  const data = av.readAv(dir);
  assert.deepStrictEqual(data.version, { major: 0, minor: 0, patch: 0 });
  assert.deepStrictEqual(data.config.markdown, []);
  assert.strictEqual(data.config.tracker, null);
});

test('init is a no-op when appversion.json already exists', () => {
  const dir = tmp();
  av.initFile(dir);
  const first = av.readAv(dir);
  first.version.major = 9;
  av.writeJson(path.join(dir, 'appversion.json'), first);
  const created = av.initFile(dir);
  assert.strictEqual(created, false);
  assert.strictEqual(av.readAv(dir).version.major, 9);
});

test('readAv throws a clear error when the file is missing', () => {
  const dir = tmp();
  assert.throws(() => av.readAv(dir), /appversion\.json not found/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `Cannot find module '../scripts/appversion.js'`.

- [ ] **Step 3: Write minimal implementation** — create `scripts/appversion.js`

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '1.0.0';

function template() {
  return {
    version: { major: 0, minor: 0, patch: 0 },
    status: { stage: null, number: 0 },
    build: { date: null, number: 0, total: 0 },
    commit: null,
    config: { appversion: SCHEMA_VERSION, markdown: [], json: [], ignore: [], tracker: null },
  };
}

function avPath(dir) {
  return path.join(dir || process.cwd(), 'appversion.json');
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function readAv(dir) {
  const file = avPath(dir);
  if (!fs.existsSync(file)) {
    throw new Error('appversion.json not found; run `appversion init` first');
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`appversion.json is not valid JSON: ${e.message}`);
  }
}

function initFile(dir) {
  const file = avPath(dir);
  if (fs.existsSync(file)) return false;
  writeJson(file, template());
  return true;
}

module.exports = { SCHEMA_VERSION, template, avPath, writeJson, readAv, initFile };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion init + json i/o"
```

---

## Task 3: `versionString` + `show`

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('versionString formats the semver core', () => {
  assert.strictEqual(av.versionString({ version: { major: 1, minor: 4, patch: 2 } }), '1.4.2');
});

test('show returns the requested field', () => {
  const data = av.template();
  data.version = { major: 2, minor: 0, patch: 1 };
  data.commit = 'abc1234';
  assert.strictEqual(av.show(data, 'version'), '2.0.1');
  assert.strictEqual(av.show(data, 'commit'), 'abc1234');
  assert.strictEqual(JSON.parse(av.show(data, 'full')).version.major, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.versionString is not a function`.

- [ ] **Step 3: Write minimal implementation** — add these functions to `scripts/appversion.js` (above `module.exports`) and add their names to the exports object

```js
function versionString(av) {
  const v = av.version;
  return `${v.major}.${v.minor}.${v.patch}`;
}

function statusString(av) {
  if (!av.status || !av.status.stage) return 'stable';
  return av.status.number ? `${av.status.stage}.${av.status.number}` : av.status.stage;
}

function show(av, field) {
  switch (field || 'full') {
    case 'version': return versionString(av);
    case 'status': return statusString(av);
    case 'build': return JSON.stringify(av.build);
    case 'commit': return av.commit == null ? '' : String(av.commit);
    case 'full': return JSON.stringify(av, null, 2);
    default: throw new Error(`unknown field: ${field}`);
  }
}
```

Update exports to include `versionString, statusString, show`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion show + version formatting"
```

---

## Task 4: `applyBump` (version math + build reset)

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('applyBump follows semver and resets lower fields + build.number', () => {
  const base = () => {
    const d = av.template();
    d.version = { major: 1, minor: 2, patch: 3 };
    d.build = { date: '01.01.2026', number: 7, total: 42 };
    return d;
  };

  const major = base(); av.applyBump(major, 'major');
  assert.deepStrictEqual(major.version, { major: 2, minor: 0, patch: 0 });

  const minor = base(); av.applyBump(minor, 'minor');
  assert.deepStrictEqual(minor.version, { major: 1, minor: 3, patch: 0 });

  const patch = base(); av.applyBump(patch, 'patch');
  assert.deepStrictEqual(patch.version, { major: 1, minor: 2, patch: 4 });

  // build.number resets to 0 on any bump; total is preserved
  assert.strictEqual(patch.build.number, 0);
  assert.strictEqual(patch.build.total, 42);
});

test('applyBump rejects an invalid level', () => {
  assert.throws(() => av.applyBump(av.template(), 'huge'), /invalid bump level/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.applyBump is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js` and export `applyBump`

```js
function applyBump(av, level) {
  const v = av.version;
  if (level === 'major') { v.major += 1; v.minor = 0; v.patch = 0; }
  else if (level === 'minor') { v.minor += 1; v.patch = 0; }
  else if (level === 'patch') { v.patch += 1; }
  else throw new Error(`invalid bump level: ${level} (expected major|minor|patch)`);
  av.build.number = 0;
  return versionString(av);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion bump version math"
```

---

## Task 5: `today` + `build` command

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('today formats DD.MM.YYYY from local date parts', () => {
  assert.strictEqual(av.today(new Date(2026, 6, 8)), '08.07.2026'); // month is 0-indexed
});

test('applyBuild increments number + total and stamps the date', () => {
  const d = av.template();
  d.build = { date: null, number: 2, total: 5 };
  av.applyBuild(d, new Date(2026, 6, 18));
  assert.deepStrictEqual(d.build, { date: '18.07.2026', number: 3, total: 6 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.today is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js` and export `today, applyBuild`

```js
function today(now) {
  const d = now || new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function applyBuild(av, now) {
  av.build.number += 1;
  av.build.total += 1;
  av.build.date = today(now);
  return av.build;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion build counter + date stamp"
```

---

## Task 6: `status` command + validation

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('applyStatus normalizes stage and sets number', () => {
  const d = av.template();
  av.applyStatus(d, 'RC', 2);
  assert.deepStrictEqual(d.status, { stage: 'rc', number: 2 });
  av.applyStatus(d, 'stable');
  assert.deepStrictEqual(d.status, { stage: 'stable', number: 0 });
});

test('applyStatus rejects an unknown stage', () => {
  assert.throws(() => av.applyStatus(av.template(), 'gamma'), /invalid status stage/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.applyStatus is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js` and export `applyStatus`

```js
const STAGES = ['stable', 'rc', 'beta', 'alpha'];

function applyStatus(av, stage, number) {
  const norm = String(stage || '').toLowerCase();
  if (!STAGES.includes(norm)) {
    throw new Error(`invalid status stage: ${stage} (expected ${STAGES.join('|')})`);
  }
  av.status.stage = norm;
  av.status.number = Number(number) || 0;
  return av.status;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion status stage"
```

---

## Task 7: `refreshBadges` in configured markdown

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('refreshBadges rewrites shields version + status badges', () => {
  const dir = tmp();
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(readme,
    '# App\n' +
    '![v](https://img.shields.io/badge/version-0.1.0-brightgreen.svg)\n' +
    '![s](https://img.shields.io/badge/status-alpha-orange.svg)\n');
  const d = av.template();
  d.version = { major: 0, minor: 2, patch: 0 };
  d.status = { stage: 'stable', number: 0 };
  d.config.markdown = ['README.md'];
  av.refreshBadges(d, dir);
  const out = fs.readFileSync(readme, 'utf8');
  assert.match(out, /badge\/version-0\.2\.0-brightgreen/);
  assert.match(out, /badge\/status-stable-orange/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.refreshBadges is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js` and export `refreshBadges`

```js
function encodeBadge(s) {
  return String(s).replace(/-/g, '--').replace(/ /g, '_');
}

function refreshBadges(av, dir, opts) {
  const ver = encodeBadge(versionString(av));
  const stage = encodeBadge((av.status && av.status.stage) || 'stable');
  for (const rel of (av.config.markdown || [])) {
    const file = path.join(dir || process.cwd(), rel);
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/(badge\/version-)([^-)\s]+)(-)/g, `$1${ver}$3`);
    text = text.replace(/(badge\/status-)([^-)\s]+)(-)/g, `$1${stage}$3`);
    if (opts && opts.dryRun) { console.log(`would update badges in ${file}`); continue; }
    fs.writeFileSync(file, text);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion badge refresh"
```

---

## Task 8: `propagate` version to package.json + config.json

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('propagate updates package.json and configured json files', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'demo', version: '0.1.0' }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'manifest.json'),
    JSON.stringify({ version: '0.1.0', other: true }, null, 2) + '\n');
  const noVersion = path.join(dir, 'data.json');
  fs.writeFileSync(noVersion, JSON.stringify({ hello: 'world' }, null, 2) + '\n');

  const d = av.template();
  d.version = { major: 0, minor: 2, patch: 0 };
  d.config.json = ['manifest.json', 'data.json'];
  av.propagate(d, dir, {});

  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '0.2.0');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version, '0.2.0');
  // files without a version field are left untouched
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(noVersion, 'utf8')), { hello: 'world' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.propagate is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js` and export `propagate`

```js
function setJsonVersion(file, version, dryRun) {
  if (!fs.existsSync(file)) return;
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return; } // skip unreadable JSON silently; SKILL surfaces the file list
  if (!Object.prototype.hasOwnProperty.call(data, 'version')) return;
  data.version = version;
  if (dryRun) { console.log(`would update ${file} -> ${version}`); return; }
  writeJson(file, data);
}

function propagate(av, dir, opts) {
  const version = versionString(av);
  const root = dir || process.cwd();
  setJsonVersion(path.join(root, 'package.json'), version, opts && opts.dryRun);
  for (const rel of (av.config.json || [])) {
    setJsonVersion(path.join(root, rel), version, opts && opts.dryRun);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion version propagation"
```

---

## Task 9: `stampCommit` (injectable git runner)

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('stampCommit records the short hash from the runner', () => {
  const d = av.template();
  const changed = av.stampCommit(d, () => 'deadbee');
  assert.strictEqual(changed, true);
  assert.strictEqual(d.commit, 'deadbee');
});

test('stampCommit leaves commit unchanged when git is unavailable', () => {
  const d = av.template();
  d.commit = 'previous';
  const changed = av.stampCommit(d, () => { throw new Error('not a git repo'); });
  assert.strictEqual(changed, false);
  assert.strictEqual(d.commit, 'previous');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.stampCommit is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js`, require `child_process`, export `stampCommit`

Add near the top with the other requires:

```js
const { execSync } = require('child_process');
```

Add the function and default runner:

```js
function defaultGitRunner(dir) {
  return execSync('git rev-parse --short HEAD', { cwd: dir || process.cwd() })
    .toString().trim();
}

function stampCommit(av, runner) {
  try {
    const hash = (runner || defaultGitRunner)();
    if (hash) { av.commit = hash; return true; }
    return false;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/appversion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion commit stamping"
```

---

## Task 10: CLI dispatcher, flags, and errors

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
const { execFileSync } = require('child_process');
const CLI = path.join(__dirname, '..', 'scripts', 'appversion.js');

function runCli(args, opts) {
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
}

test('CLI bump updates appversion.json and package.json end to end', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');
  const out = runCli(['bump', 'minor', '--path', dir]).trim();
  assert.strictEqual(out, '0.1.0');
  assert.strictEqual(av.readAv(dir).version.minor, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '0.1.0');
});

test('CLI --dry-run writes nothing', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);
  const before = fs.readFileSync(path.join(dir, 'appversion.json'), 'utf8');
  runCli(['bump', 'major', '--path', dir, '--dry-run']);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'appversion.json'), 'utf8'), before);
});

test('CLI exits non-zero on unknown command', () => {
  assert.throws(() => runCli(['frobnicate']), /Command failed/);
});

test('CLI exits non-zero when bumping without appversion.json', () => {
  const dir = tmp();
  assert.throws(() => runCli(['bump', 'patch', '--path', dir]), /Command failed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — the CLI has no dispatcher yet (unknown command does not exit non-zero / bump does not run).

- [ ] **Step 3: Write minimal implementation** — add `parseArgs` + `main` to `scripts/appversion.js`, then the entry guard

```js
function parseArgs(argv) {
  const rest = argv.slice(2);
  const opts = { path: process.cwd(), json: false, dryRun: false };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--path') { opts.path = rest[++i]; }
    else if (a === '--json') { opts.json = true; }
    else if (a === '--dry-run') { opts.dryRun = true; }
    else { positional.push(a); }
  }
  return { command: positional[0], args: positional.slice(1), opts };
}

function commitAv(av, opts) {
  if (opts.dryRun) { console.log(`would write ${avPath(opts.path)}`); return; }
  writeJson(avPath(opts.path), av);
}

function main(argv) {
  const { command, args, opts } = parseArgs(argv);
  try {
    switch (command) {
      case 'init': {
        if (opts.dryRun) { console.log(`would create ${avPath(opts.path)}`); break; }
        const created = initFile(opts.path);
        console.log(created ? avPath(opts.path) : 'appversion.json already exists');
        break;
      }
      case 'show': {
        console.log(show(readAv(opts.path), args[0]));
        break;
      }
      case 'bump': {
        const data = readAv(opts.path);
        applyBump(data, args[0]);
        stampCommit(data, () => defaultGitRunner(opts.path));
        propagate(data, opts.path, opts);
        refreshBadges(data, opts.path, opts);
        commitAv(data, opts);
        console.log(opts.json ? show(data, 'full') : versionString(data));
        break;
      }
      case 'build': {
        const data = readAv(opts.path);
        applyBuild(data);
        commitAv(data, opts);
        console.log(opts.json ? show(data, 'full') : JSON.stringify(data.build));
        break;
      }
      case 'status': {
        const data = readAv(opts.path);
        applyStatus(data, args[0], args[1]);
        refreshBadges(data, opts.path, opts);
        commitAv(data, opts);
        console.log(opts.json ? show(data, 'full') : statusString(data));
        break;
      }
      default:
        throw new Error(`unknown command: ${command || '(none)'} ` +
          `(expected init|show|bump|build|status|tickets)`);
    }
  } catch (err) {
    process.stderr.write(`appversion: ${err.message}\n`);
    process.exit(1);
  }
}
```

Add `parseArgs, main` to the exports object, and add the entry guard as the **last line** of the file:

```js
if (require.main === module) main(process.argv);
```

> **Assembly order for `scripts/appversion.js`** (top to bottom): requires (`fs`, `path`, `child_process`) → `SCHEMA_VERSION` → `template` → `avPath` → `writeJson` → `readAv` → `initFile` → `versionString` → `statusString` → `show` → `applyBump` → `today` → `applyBuild` → `STAGES` → `applyStatus` → `encodeBadge` → `refreshBadges` → `setJsonVersion` → `propagate` → `defaultGitRunner` → `stampCommit` → `parseArgs` → `commitAv` → `main` → `module.exports = { ... all of the above ... }` → `if (require.main === module) main(process.argv);`

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS (all Task 2–10 tests).

- [ ] **Step 5: Make the script executable and commit**

```bash
chmod +x scripts/appversion.js
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion CLI dispatcher + flags"
```

---

## Task 11: `references/appversion-schema.md`

**Files:**
- Create: `references/appversion-schema.md`

- [ ] **Step 1: Write the reference doc**

````markdown
# appversion.json schema

The skill maintains a single `appversion.json` at the repo root.

```json
{
  "version": { "major": 0, "minor": 0, "patch": 0 },
  "status":  { "stage": null, "number": 0 },
  "build":   { "date": null, "number": 0, "total": 0 },
  "commit":  null,
  "config":  { "appversion": "1.0.0", "markdown": [], "json": [], "ignore": [], "tracker": null }
}
```

| Field | Meaning |
|-------|---------|
| `version.major/minor/patch` | Semver core. `bump major` zeroes minor+patch; `bump minor` zeroes patch. |
| `status.stage` | One of `stable`, `rc`, `beta`, `alpha` (stored lowercase). `null` = unset (treated as stable). |
| `status.number` | Iteration within a pre-release stage (e.g. `rc.2`). |
| `build.date` | Last build date, formatted `DD.MM.YYYY`. |
| `build.number` | Builds of the **current** version. Reset to `0` on any version bump. |
| `build.total` | Cumulative builds across all versions. Never reset. |
| `commit` | Short git hash stamped at bump time (the last code commit). |
| `config.appversion` | Schema version of this file (`1.0.0`), used to detect an out-of-date file. |
| `config.markdown` | Markdown files whose shields.io version/status badges are kept in sync. |
| `config.json` | Extra JSON files whose top-level `version` is kept in sync (besides `package.json`). |
| `config.ignore` | Folders to skip when searching. |
| `config.tracker` | Issue-tracker config: one object or an array; `null` disables enrichment. See `tracker-integration.md`. |

**Distinct concepts:** a *version bump* (`bump`) changes `version.*` and resets `build.number`; a *build* (`build`) increments `build.number`/`build.total` and stamps `build.date`. They are separate commands.
````

- [ ] **Step 2: Commit**

```bash
git add references/appversion-schema.md
git commit -m "docs: appversion.json schema reference"
```

---

## Task 12: `references/changelog-format.md`

**Files:**
- Create: `references/changelog-format.md`

- [ ] **Step 1: Write the reference doc**

````markdown
# Changelog format

Follow [Keep a Changelog](https://keepachangelog.com/). Each release prepends a section:

```markdown
## [1.3.0] - 2026-07-18

### ⚠ Breaking Changes
- ...

### Added
- ...

### Fixed
- ...
```

Section date uses ISO `YYYY-MM-DD`.

## Conventional-commit → category

| Commit type | Section |
|-------------|---------|
| `feat` | Added |
| `fix` | Fixed |
| `perf`, `refactor`, `style` | Changed |
| `revert` | Removed |
| `security` | Security |
| `feat!` or `BREAKING CHANGE:` footer | ⚠ Breaking Changes (top of section) |
| `docs`, `chore`, `test`, `build`, `ci` | excluded by default |

**Non-conventional repos:** read each commit and bucket by meaning; anything ambiguous goes under **Changed**.

**Ticket enrichment:** when a change resolves a tracker ticket, use the ticket title and link it, e.g.
`- Add CSV export ([PROJ-142](https://acme.atlassian.net/browse/PROJ-142))`.

## Link references

Keep compare links at the bottom of the file:

```markdown
[Unreleased]: https://github.com/<owner>/<repo>/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/<owner>/<repo>/compare/v1.2.0...v1.3.0
```

The GitHub Release notes are the new section's body with the `## [x.y.z] - date` heading removed.
````

- [ ] **Step 2: Commit**

```bash
git add references/changelog-format.md
git commit -m "docs: changelog format reference"
```

---

## Task 13: `SKILL.md` (core orchestration)

**Files:**
- Create: `SKILL.md`

- [ ] **Step 1: Write the skill procedure**

````markdown
---
name: appversion
description: Use when the user wants to bump a version, cut a release, or tag a release — analyze commits since the last version, recommend and apply a semver bump to appversion.json + package.json, update the changelog, and create the git tag + GitHub Release.
---

# AppVersion release skill

Manage an application's version (SemVer) via `appversion.json`, then changelog, tag, and GitHub
Release. Deterministic mechanics live in `scripts/appversion.js` (run it; do not reimplement its
math). This procedure is agent-neutral: every step is a shell command, a file read, or a git/gh
action.

## When to use
The user asks to bump a version, cut/tag a release, or "release vX".

## Procedure

### 1. Preflight
- Confirm you are in a git repo: `git rev-parse --is-inside-work-tree`.
- Ensure `appversion.json` exists: `node scripts/appversion.js show version --path .`
  If it errors, offer to create it: `node scripts/appversion.js init` — then ask the user for the
  starting version instead of assuming `0.0.0`.
- Determine the **last version**, in order: latest `v*` tag (`git describe --tags --match 'v*' --abbrev=0`),
  else `appversion.json`, else `package.json`.
- If the working tree is dirty (`git status --porcelain` non-empty), warn and confirm before continuing.

### 2. Analyze changes
- List commits since the last version: `git log <lastTag>..HEAD --pretty=format:'%h %s'` (all commits if no tag).
- Group them by PR/branch: prefer `(#N)` in squash-merge subjects or merge-commit messages; if `gh`
  is available, `gh pr list --state merged --search 'merged:>=<date>'` helps. If there is no PR
  structure, group by conventional-commit type.
- Detect Conventional Commits. Map `feat!`/`BREAKING CHANGE` → major, `feat` → minor, everything
  else (`fix`, `chore`, ...) → patch. If not conventional, read each commit and infer intent.

### 3. Recommend (GATE 1)
Present an **itemized** recommendation and WAIT for explicit approval. Format:

```
Since <lastVersion> — <N> commits across <M> PRs/branches:

  <branch>  <summary>   → <level>   <one-line reason>
  ...

  Tally: <counts>
  → Recommended bump: <LEVEL> (highest level wins)
  → <old> → <new>

  Because: <plain-language rationale>. Proceed?
```

Bump math is **standard semver**: the itemized counts are rationale; the actual bump is a single
step at the highest level present. `major` (any breaking change) wins over any minors/patches.

### 4. Apply the bump
After approval:
```
node scripts/appversion.js bump <level> --path .
```
This updates `appversion.json`, `package.json`, every file in `config.json`, and badges in
`config.markdown`, and stamps the commit hash.

For a pre-release or promotion, also run `node scripts/appversion.js status <stable|rc|beta|alpha> [n]`.

### 5. Changelog (GATE 2)
Build a new `## [x.y.z] - YYYY-MM-DD` section from the grouped commits, following
`references/changelog-format.md`. Create `CHANGELOG.md` with a standard header if missing; otherwise
prepend the new section and update the compare links. Show the section to the user and let them edit
the wording before continuing.

### 6. Commit + tag
```
git add appversion.json package.json CHANGELOG.md <any config.json/markdown files>
git commit -m "chore(release): v<x.y.z>"
git tag -a v<x.y.z> -m "<changelog section body>"
```

### 7. Push + Release (GATE 3)
This is outward-facing and effectively permanent. Confirm first, then:
```
git push && git push origin v<x.y.z>
gh release create v<x.y.z> --notes-file <file with the section body>
```

## Graceful degradation
- No remote → create the local tag only; skip push + Release; tell the user.
- `gh` missing/unauthenticated (`gh auth status`) → skip the Release; print the manual command.
- No `package.json` → the bump touches `appversion.json` (+ `config.json`) only.
- Never push or create a Release without passing GATE 3.
````

- [ ] **Step 2: Manual smoke check**

Create a throwaway git repo, copy `scripts/` + `SKILL.md`, run `node scripts/appversion.js init` then `node scripts/appversion.js bump minor --path .`, and confirm `appversion.json` shows `0.1.0`. Delete the throwaway repo.

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "docs: appversion SKILL procedure (core)"
```

---

## Task 14: `README.md` + `AGENTS.md`

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# appversion skill

An agent skill that turns "cut a release" into a guided, reviewable flow: analyze commits since the
last version, recommend and apply a SemVer bump to `appversion.json` + `package.json`, update the
changelog, and create the git tag + GitHub Release. Optional read-only enrichment from Jira, Plane,
Shortcut, ClickUp, or Linear.

## Requirements
- Node.js ≥ 18 (uses `node:test` and global `fetch`; no third-party dependencies)
- `git`; `gh` (GitHub CLI) for the Release step

## Install (Claude Code)
```bash
ln -s "$(pwd)" ~/.claude/skills/appversion
```
Then invoke it by asking to bump/release a version.

## Use directly (any agent or by hand)
```bash
node scripts/appversion.js init
node scripts/appversion.js bump minor
node scripts/appversion.js show version
```

## Test
```bash
npm test   # == node --test
```

See `SKILL.md` for the full procedure and `references/` for schema, changelog, and tracker details.
````

- [ ] **Step 2: Write `AGENTS.md`**

````markdown
# Agent pointer

This repository is the `appversion` skill. Any coding agent can use it:

1. Read `SKILL.md` — it is the procedure, written as plain shell/git/gh steps.
2. Run the deterministic mechanics via `node scripts/appversion.js <command>`
   (`init`, `show`, `bump`, `build`, `status`, `tickets`).
3. Consult `references/` for the JSON schema, changelog format, and tracker configuration.

Nothing here is Claude-specific; the same files work under Gemini CLI, Copilot, opencode, or Codex.
````

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: README + AGENTS pointer"
```

---

## Task 15: Phase 1 verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: PASS, all Task 2–10 tests green.

- [ ] **Step 2: End-to-end dry run in a throwaway repo**

```bash
D=$(mktemp -d); git -C "$D" init -q
node scripts/appversion.js init --path "$D"
printf '{\n  "name": "demo",\n  "version": "0.0.0"\n}\n' > "$D/package.json"
git -C "$D" add -A && git -C "$D" commit -qm "feat: initial"
node scripts/appversion.js bump minor --path "$D"
node scripts/appversion.js show full --path "$D"
rm -rf "$D"
```
Expected: `show full` reports `version.minor = 1`, `package.json` version `0.1.0`, and a stamped `commit`.

- [ ] **Step 3: Milestone commit**

```bash
git commit --allow-empty -m "chore: phase 1 complete — working release skill (no trackers)"
```

---

# PHASE 2 — Tracker enrichment (read-only, optional)

## Task 16: Tracker registry with a fake adapter

**Files:**
- Create: `scripts/trackers/index.js`
- Create: `test/trackers.test.js`

- [ ] **Step 1: Write the failing test** — create `test/trackers.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const reg = require('../scripts/trackers/index.js');

// A fake provider factory shaped like a real adapter.
function fakeFactory(name, prefix, store) {
  return (cfg) => ({
    name,
    keyPrefixes: cfg.keyPrefixes || [prefix],
    detectIds(text) {
      const re = new RegExp(`\\b${prefix}-\\d+\\b`, 'g');
      return [...new Set(String(text).match(re) || [])];
    },
    async getTicket(id) { return store[id] || null; },
  });
}

test('providersFor builds providers from a single object or an array', () => {
  const adapters = { foo: fakeFactory('foo', 'FOO', {}) };
  const one = reg.providersFor({ provider: 'foo', keyPrefixes: ['FOO'] }, adapters);
  const many = reg.providersFor([{ provider: 'foo', keyPrefixes: ['FOO'] }], adapters);
  assert.strictEqual(one.length, 1);
  assert.strictEqual(many.length, 1);
  assert.strictEqual(one[0].name, 'foo');
});

test('detectTickets routes each id to the provider that matches it', () => {
  const adapters = {
    foo: fakeFactory('foo', 'FOO', {}),
    bar: fakeFactory('bar', 'BAR', {}),
  };
  const providers = reg.providersFor(
    [{ provider: 'foo', keyPrefixes: ['FOO'] }, { provider: 'bar', keyPrefixes: ['BAR'] }],
    adapters);
  const found = reg.detectTickets('fixes FOO-1 and BAR-9 and FOO-1 again', providers);
  const pairs = found.map(f => `${f.provider.name}:${f.id}`).sort();
  assert.deepStrictEqual(pairs, ['bar:BAR-9', 'foo:FOO-1']);
});

test('fetchTickets returns parsed tickets and drops nulls', async () => {
  const store = { 'FOO-1': { id: 'FOO-1', title: 'A', type: 'Bug', status: 'Done', url: 'u', provider: 'foo' } };
  const adapters = { foo: fakeFactory('foo', 'FOO', store) };
  const providers = reg.providersFor({ provider: 'foo', keyPrefixes: ['FOO'] }, adapters);
  const found = reg.detectTickets('FOO-1 FOO-2', providers);
  const tickets = await reg.fetchTickets(found);
  assert.strictEqual(tickets.length, 1);
  assert.strictEqual(tickets[0].title, 'A');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trackers.test.js`
Expected: FAIL — `Cannot find module '../scripts/trackers/index.js'`.

- [ ] **Step 3: Write minimal implementation** — create `scripts/trackers/index.js`

```js
'use strict';

// Default adapter registry; tests may inject their own map as the 2nd arg.
const defaultAdapters = {
  jira: require('./jira'),
  plane: require('./plane'),
  shortcut: require('./shortcut'),
  clickup: require('./clickup'),
  linear: require('./linear'),
};

function normalizeConfig(trackerConfig) {
  if (!trackerConfig) return [];
  return Array.isArray(trackerConfig) ? trackerConfig : [trackerConfig];
}

function providersFor(trackerConfig, adapters) {
  const map = adapters || defaultAdapters;
  return normalizeConfig(trackerConfig)
    .map((cfg) => {
      const factory = map[cfg.provider];
      return factory ? factory(cfg) : null;
    })
    .filter(Boolean);
}

function detectTickets(text, providers) {
  const seen = new Set();
  const out = [];
  for (const provider of providers) {
    for (const id of provider.detectIds(text)) {
      const key = `${provider.name}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, provider });
    }
  }
  return out;
}

function routeId(id, providers) {
  for (const provider of providers) {
    if (provider.detectIds(id).length) return provider;
  }
  return null;
}

async function fetchTickets(items) {
  const results = await Promise.all(items.map((it) => it.provider.getTicket(it.id)));
  return results.filter(Boolean);
}

module.exports = { defaultAdapters, normalizeConfig, providersFor, detectTickets, routeId, fetchTickets };
```

> Note: this file `require`s the five adapters. Create empty stub modules now so it loads, then fill each in Tasks 17–21:
> ```bash
> for p in jira plane shortcut clickup linear; do \
>   printf "'use strict';\nmodule.exports = function(cfg){ return { name: '%s', keyPrefixes: cfg.keyPrefixes||[], detectIds(){return [];}, async getTicket(){return null;} }; };\n" "$p" > scripts/trackers/$p.js; done
> ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trackers.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/trackers/
git add test/trackers.test.js
git commit -m "feat: tracker registry + routing"
```

---

## Task 17: Jira adapter

**Files:**
- Modify: `scripts/trackers/jira.js`
- Modify: `test/trackers.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/trackers.test.js`

```js
const jira = require('../scripts/trackers/jira.js');

function withFetch(stub, fn) {
  const orig = global.fetch;
  global.fetch = stub;
  return Promise.resolve(fn()).finally(() => { global.fetch = orig; });
}

test('jira detectIds matches configured prefixes only', () => {
  const p = jira({ host: 'https://x', keyPrefixes: ['PROJ'] });
  assert.deepStrictEqual(p.detectIds('PROJ-12 and NOPE-9'), ['PROJ-12']);
});

test('jira getTicket parses the REST response and builds the url', async () => {
  process.env.JIRA_EMAIL = 'me@x.com';
  process.env.JIRA_API_TOKEN = 'tok';
  const p = jira({ host: 'https://acme.atlassian.net', keyPrefixes: ['PROJ'] });
  let calledUrl, calledAuth;
  await withFetch(async (url, init) => {
    calledUrl = url; calledAuth = init.headers.Authorization;
    return { ok: true, json: async () => ({ fields: { summary: 'CSV export', issuetype: { name: 'Story' }, status: { name: 'Done' } } }) };
  }, async () => {
    const t = await p.getTicket('PROJ-142');
    assert.deepStrictEqual(t, { id: 'PROJ-142', title: 'CSV export', type: 'Story', status: 'Done', url: 'https://acme.atlassian.net/browse/PROJ-142', provider: 'jira' });
  });
  assert.match(calledUrl, /\/rest\/api\/3\/issue\/PROJ-142/);
  assert.match(calledAuth, /^Basic /);
});

test('jira getTicket returns null on HTTP error', async () => {
  const p = jira({ host: 'https://acme.atlassian.net', keyPrefixes: ['PROJ'] });
  await withFetch(async () => ({ ok: false, status: 404 }), async () => {
    assert.strictEqual(await p.getTicket('PROJ-1'), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trackers.test.js`
Expected: FAIL — the stub adapter returns `[]` / `null`.

- [ ] **Step 3: Write minimal implementation** — replace `scripts/trackers/jira.js`

```js
'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createJira(cfg) {
  const host = (cfg.host || '').replace(/\/$/, '');
  const prefixes = cfg.keyPrefixes || [];
  const idRe = prefixes.length
    ? new RegExp(`\\b(?:${prefixes.map(escapeRe).join('|')})-\\d+\\b`, 'g')
    : /\b[A-Z][A-Z0-9]+-\d+\b/g;

  return {
    name: 'jira',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      if (!host || !email || !token) return null;
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      try {
        const res = await fetch(`${host}/rest/api/3/issue/${id}?fields=summary,issuetype,status`, {
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          id,
          title: data.fields.summary,
          type: data.fields.issuetype && data.fields.issuetype.name,
          status: data.fields.status && data.fields.status.name,
          url: `${host}/browse/${id}`,
          provider: 'jira',
        };
      } catch { return null; }
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trackers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/trackers/jira.js test/trackers.test.js
git commit -m "feat: jira tracker adapter"
```

---

## Task 18: Plane adapter

**Files:**
- Modify: `scripts/trackers/plane.js`
- Modify: `test/trackers.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/trackers.test.js`

```js
const plane = require('../scripts/trackers/plane.js');

test('plane getTicket parses response and builds url from host/workspace', async () => {
  process.env.PLANE_API_TOKEN = 'tok';
  const p = plane({ host: 'https://plane.acme.dev', workspace: 'acme', keyPrefixes: ['APP'] });
  let calledUrl, calledKey;
  await withFetch(async (url, init) => {
    calledUrl = url; calledKey = init.headers['X-API-Key'];
    return { ok: true, json: async () => ({ name: 'Bulk import', priority: 'high', state_detail: { name: 'Done' } }) };
  }, async () => {
    const t = await p.getTicket('APP-88');
    assert.strictEqual(t.title, 'Bulk import');
    assert.strictEqual(t.status, 'Done');
    assert.strictEqual(t.provider, 'plane');
  });
  assert.match(calledUrl, /acme/);
  assert.strictEqual(calledKey, 'tok');
});

test('plane getTicket returns null without a token', async () => {
  delete process.env.PLANE_API_TOKEN;
  const p = plane({ host: 'https://plane.acme.dev', workspace: 'acme', keyPrefixes: ['APP'] });
  assert.strictEqual(await p.getTicket('APP-1'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trackers.test.js`
Expected: FAIL — stub adapter.

- [ ] **Step 3: Write minimal implementation** — replace `scripts/trackers/plane.js`

```js
'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createPlane(cfg) {
  const host = (cfg.host || '').replace(/\/$/, '');
  const workspace = cfg.workspace || '';
  const prefixes = cfg.keyPrefixes || [];
  const idRe = prefixes.length
    ? new RegExp(`\\b(?:${prefixes.map(escapeRe).join('|')})-\\d+\\b`, 'g')
    : /\b[A-Z][A-Z0-9]+-\d+\b/g;

  return {
    name: 'plane',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const token = process.env.PLANE_API_TOKEN;
      if (!host || !workspace || !token) return null;
      const url = `${host}/api/v1/workspaces/${workspace}/issues/${id}/`;
      try {
        const res = await fetch(url, { headers: { 'X-API-Key': token, Accept: 'application/json' } });
        if (!res.ok) return null;
        const d = await res.json();
        return {
          id,
          title: d.name,
          type: d.priority || null,
          status: d.state_detail && d.state_detail.name,
          url: `${host}/${workspace}/browse/${id}`,
          provider: 'plane',
        };
      } catch { return null; }
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trackers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/trackers/plane.js test/trackers.test.js
git commit -m "feat: plane tracker adapter"
```

---

## Task 19: Shortcut adapter

**Files:**
- Modify: `scripts/trackers/shortcut.js`
- Modify: `test/trackers.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/trackers.test.js`

```js
const shortcut = require('../scripts/trackers/shortcut.js');

test('shortcut detectIds matches sc-<n> refs (case-insensitive)', () => {
  const p = shortcut({});
  assert.deepStrictEqual(p.detectIds('done sc-1234, SC-9 and #55'), ['sc-1234', 'SC-9']);
});

test('shortcut getTicket parses story response', async () => {
  process.env.SHORTCUT_API_TOKEN = 'tok';
  const p = shortcut({});
  let calledUrl, calledToken;
  await withFetch(async (url, init) => {
    calledUrl = url; calledToken = init.headers['Shortcut-Token'];
    return { ok: true, json: async () => ({ name: 'Fix crash', story_type: 'bug', completed: true, app_url: 'https://app.shortcut.com/o/story/1234' }) };
  }, async () => {
    const t = await p.getTicket('sc-1234');
    assert.strictEqual(t.title, 'Fix crash');
    assert.strictEqual(t.type, 'bug');
    assert.strictEqual(t.status, 'completed');
    assert.strictEqual(t.url, 'https://app.shortcut.com/o/story/1234');
  });
  assert.match(calledUrl, /\/api\/v3\/stories\/1234/);
  assert.strictEqual(calledToken, 'tok');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trackers.test.js`
Expected: FAIL — stub adapter.

- [ ] **Step 3: Write minimal implementation** — replace `scripts/trackers/shortcut.js`

```js
'use strict';

module.exports = function createShortcut(cfg) {
  const idRe = /\bsc-\d+\b/gi;
  return {
    name: 'shortcut',
    keyPrefixes: cfg.keyPrefixes || [],
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const token = process.env.SHORTCUT_API_TOKEN;
      if (!token) return null;
      const num = String(id).replace(/\D/g, '');
      try {
        const res = await fetch(`https://api.app.shortcut.com/api/v3/stories/${num}`, {
          headers: { 'Shortcut-Token': token, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const d = await res.json();
        return {
          id,
          title: d.name,
          type: d.story_type,
          status: d.completed ? 'completed' : (d.started ? 'started' : 'unstarted'),
          url: d.app_url,
          provider: 'shortcut',
        };
      } catch { return null; }
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trackers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/trackers/shortcut.js test/trackers.test.js
git commit -m "feat: shortcut tracker adapter"
```

---

## Task 20: ClickUp adapter

**Files:**
- Modify: `scripts/trackers/clickup.js`
- Modify: `test/trackers.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/trackers.test.js`

```js
const clickup = require('../scripts/trackers/clickup.js');

test('clickup detectIds matches CU-<id> and configured custom prefixes', () => {
  const p = clickup({ keyPrefixes: ['ABC'] });
  assert.deepStrictEqual(p.detectIds('CU-8xy in ABC-42 not ZZZ-1').sort(), ['ABC-42', 'CU-8xy']);
});

test('clickup getTicket parses task response', async () => {
  process.env.CLICKUP_API_TOKEN = 'tok';
  const p = clickup({});
  let calledUrl, calledAuth;
  await withFetch(async (url, init) => {
    calledUrl = url; calledAuth = init.headers.Authorization;
    return { ok: true, json: async () => ({ name: 'Wrong total', status: { status: 'closed' }, url: 'https://app.clickup.com/t/8xy' }) };
  }, async () => {
    const t = await p.getTicket('CU-8xy');
    assert.strictEqual(t.title, 'Wrong total');
    assert.strictEqual(t.status, 'closed');
    assert.strictEqual(t.provider, 'clickup');
  });
  assert.match(calledUrl, /\/api\/v2\/task\/8xy/);
  assert.strictEqual(calledAuth, 'tok');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trackers.test.js`
Expected: FAIL — stub adapter.

- [ ] **Step 3: Write minimal implementation** — replace `scripts/trackers/clickup.js`

```js
'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createClickUp(cfg) {
  const prefixes = cfg.keyPrefixes || [];
  const alts = ['CU'].concat(prefixes).map(escapeRe).join('|');
  const idRe = new RegExp(`\\b(?:${alts})-[A-Za-z0-9]+\\b`, 'g');

  return {
    name: 'clickup',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const token = process.env.CLICKUP_API_TOKEN;
      if (!token) return null;
      const taskId = String(id).replace(/^CU-/, '');
      try {
        const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
          headers: { Authorization: token, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const d = await res.json();
        return {
          id,
          title: d.name,
          type: 'task',
          status: d.status && d.status.status,
          url: d.url,
          provider: 'clickup',
        };
      } catch { return null; }
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trackers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/trackers/clickup.js test/trackers.test.js
git commit -m "feat: clickup tracker adapter"
```

---

## Task 21: Linear adapter (GraphQL)

**Files:**
- Modify: `scripts/trackers/linear.js`
- Modify: `test/trackers.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/trackers.test.js`

```js
const linear = require('../scripts/trackers/linear.js');

test('linear getTicket posts GraphQL and parses the issue', async () => {
  process.env.LINEAR_API_KEY = 'lin_key';
  const p = linear({ keyPrefixes: ['COR'] });
  let calledInit;
  await withFetch(async (url, init) => {
    calledInit = init;
    return { ok: true, json: async () => ({ data: { issue: { identifier: 'COR-494', title: 'Export', url: 'https://linear.app/x/issue/COR-494', state: { name: 'Done' }, labels: { nodes: [{ name: 'feature' }] } } } }) };
  }, async () => {
    const t = await p.getTicket('COR-494');
    assert.strictEqual(t.title, 'Export');
    assert.strictEqual(t.status, 'Done');
    assert.strictEqual(t.type, 'feature');
    assert.strictEqual(t.url, 'https://linear.app/x/issue/COR-494');
  });
  assert.strictEqual(calledInit.method, 'POST');
  assert.strictEqual(calledInit.headers.Authorization, 'lin_key');
  assert.match(calledInit.body, /COR-494/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trackers.test.js`
Expected: FAIL — stub adapter.

- [ ] **Step 3: Write minimal implementation** — replace `scripts/trackers/linear.js`

```js
'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createLinear(cfg) {
  const prefixes = cfg.keyPrefixes || [];
  const idRe = prefixes.length
    ? new RegExp(`\\b(?:${prefixes.map(escapeRe).join('|')})-\\d+\\b`, 'g')
    : /\b[A-Z][A-Z0-9]+-\d+\b/g;

  return {
    name: 'linear',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const key = process.env.LINEAR_API_KEY;
      if (!key) return null;
      const query = `query($id:String!){ issue(id:$id){ identifier title url state{ name } labels{ nodes{ name } } } }`;
      try {
        const res = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: { Authorization: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { id } }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const issue = json.data && json.data.issue;
        if (!issue) return null;
        const labels = (issue.labels && issue.labels.nodes) || [];
        return {
          id: issue.identifier || id,
          title: issue.title,
          type: labels.length ? labels[0].name : 'issue',
          status: issue.state && issue.state.name,
          url: issue.url,
          provider: 'linear',
        };
      } catch { return null; }
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trackers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/trackers/linear.js test/trackers.test.js
git commit -m "feat: linear tracker adapter"
```

---

## Task 22: `tickets` command wired into the CLI

**Files:**
- Modify: `scripts/appversion.js`
- Modify: `test/appversion.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/appversion.test.js`

```js
test('ticketsCommand fetches via injected providers (detect mode)', async () => {
  const providers = [{
    name: 'fake',
    keyPrefixes: ['FAKE'],
    detectIds(t) { return [...new Set(String(t).match(/\bFAKE-\d+\b/g) || [])]; },
    async getTicket(id) { return { id, title: 't', type: 'x', status: 's', url: 'u', provider: 'fake' }; },
  }];
  const out = await av.ticketsCommand({ detectText: 'see FAKE-7', providers });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 'FAKE-7');
});

test('CLI tickets prints [] when no tracker is configured', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);
  const out = runCli(['tickets', 'PROJ-1', '--path', dir]).trim();
  assert.strictEqual(out, '[]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/appversion.test.js`
Expected: FAIL — `av.ticketsCommand is not a function`.

- [ ] **Step 3: Write minimal implementation** — add to `scripts/appversion.js`

Add near the top requires:

```js
const trackers = require('./trackers');
```

Add the handler (export `ticketsCommand`):

```js
async function ticketsCommand({ ids, detectText, providers }) {
  if (!providers || !providers.length) return [];
  let items;
  if (detectText != null) {
    items = trackers.detectTickets(detectText, providers);
  } else {
    items = (ids || [])
      .map((id) => ({ id, provider: trackers.routeId(id, providers) }))
      .filter((it) => it.provider);
  }
  return trackers.fetchTickets(items);
}

function readStdin() {
  try { return require('fs').readFileSync(0, 'utf8'); } catch { return ''; }
}
```

Add a `tickets` case to the `switch` in `main`. Because it is async, make the `tickets` branch handle its own promise:

```js
      case 'tickets': {
        const data = readAv(opts.path);
        const providers = trackers.providersFor(data.config.tracker);
        const detect = args[0] === '--detect';
        const p = ticketsCommand({
          ids: detect ? [] : args,
          detectText: detect ? readStdin() : null,
          providers,
        });
        p.then((list) => console.log(JSON.stringify(list, null, 2)))
         .catch((err) => { process.stderr.write(`appversion: ${err.message}\n`); process.exit(1); });
        break;
      }
```

Add `ticketsCommand` to `module.exports`.

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS (all version + tracker tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/appversion.js test/appversion.test.js
git commit -m "feat: appversion tickets command"
```

---

## Task 23: `references/tracker-integration.md`

**Files:**
- Create: `references/tracker-integration.md`

- [ ] **Step 1: Write the reference doc**

````markdown
# Issue-tracker integration (read-only)

The skill enriches the recommendation and changelog with ticket context. It **only** calls the
configured tracker's HTTPS API — it never reads a local tracker app, cache, or local data — and only
for ticket IDs found in the release range. If nothing is configured, the tracker layer does nothing.

## Configure in `appversion.json`

`config.tracker` is one object, or an array to sync several at once:

```json
"tracker": [
  { "provider": "jira",  "host": "https://acme.atlassian.net", "keyPrefixes": ["PROJ"] },
  { "provider": "plane", "host": "https://plane.acme.dev", "workspace": "acme", "keyPrefixes": ["APP"] }
]
```

Each detected ticket ID is routed to the provider whose `keyPrefixes` match it.

## Tokens (environment variables — never commit them)

| Provider | Env vars | Extra config |
|----------|----------|--------------|
| jira | `JIRA_EMAIL`, `JIRA_API_TOKEN` | `host` (base URL) |
| plane | `PLANE_API_TOKEN` | `host`, `workspace` |
| shortcut | `SHORTCUT_API_TOKEN` | — |
| clickup | `CLICKUP_API_TOKEN` | `keyPrefixes` for custom IDs (else matches `CU-…`) |
| linear | `LINEAR_API_KEY` | `keyPrefixes` (team keys) |

## ID formats

- jira / plane / linear: `PREFIX-123`
- shortcut: `sc-1234`
- clickup: `CU-abc123` or a configured custom prefix `ABC-123`

## Use it

```bash
# explicit ids
node scripts/appversion.js tickets PROJ-142 APP-88

# detect ids from piped text (branch names, commit log, PR body)
git log v1.2.0..HEAD --pretty=%s | node scripts/appversion.js tickets --detect
```

Output: `[{ id, title, type, status, url, provider }]`.

## Degradation

Missing config, unknown provider, missing token, or any HTTP/network error → that provider yields
nothing and the release proceeds using commit text. Enrichment never blocks a release.

Prefix collisions between two configured providers are unsupported (give each distinct `keyPrefixes`).
````

- [ ] **Step 2: Commit**

```bash
git add references/tracker-integration.md
git commit -m "docs: tracker integration reference"
```

---

## Task 24: Wire enrichment into `SKILL.md`

**Files:**
- Modify: `SKILL.md`

- [ ] **Step 1: Extend the Analyze step** — in `SKILL.md`, in "### 2. Analyze changes", append:

```markdown
- **Tracker enrichment (optional).** If `appversion.json` has `config.tracker`, pull real ticket
  context so the recommendation and changelog use titles/types instead of raw commit text:
  `git log <lastTag>..HEAD --pretty=%s%n%b | node scripts/appversion.js tickets --detect`
  Also detect IDs in branch names and PR bodies. This is best-effort: on any error or with no
  tracker/token, skip it and use commit text (see `references/tracker-integration.md`).
```

- [ ] **Step 2: Reference enrichment in the recommendation + changelog** — in "### 3. Recommend (GATE 1)", append:

```markdown
When ticket context is available, annotate each item with `[<provider> <ID> · <type> · <status>]`
and route its changelog link to that provider's URL.
```

- [ ] **Step 3: Manual smoke check (no token needed)**

```bash
D=$(mktemp -d); git -C "$D" init -q
node scripts/appversion.js init --path "$D"
git -C "$D" log --pretty=%s 2>/dev/null | node scripts/appversion.js tickets --detect --path "$D"
rm -rf "$D"
```
Expected: prints `[]` (no tracker configured) and exits 0 — confirming graceful degradation.

- [ ] **Step 4: Commit**

```bash
git add SKILL.md
git commit -m "docs: wire tracker enrichment into SKILL"
```

---

## Task 25: Phase 2 verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `node --test`
Expected: PASS — every version + tracker test green.

- [ ] **Step 2: Confirm graceful degradation with a configured-but-tokenless tracker**

```bash
D=$(mktemp -d)
node scripts/appversion.js init --path "$D"
node -e "const fs=require('fs'),p='$D/appversion.json',d=require(p);d.config.tracker={provider:'jira',host:'https://x',keyPrefixes:['PROJ']};fs.writeFileSync(p,JSON.stringify(d,null,2))"
echo "fixes PROJ-1" | node scripts/appversion.js tickets --detect --path "$D"
rm -rf "$D"
```
Expected: prints `[]` (no `JIRA_API_TOKEN`), exit 0 — no crash.

- [ ] **Step 3: Milestone commit**

```bash
git commit --allow-empty -m "chore: phase 2 complete — tracker enrichment"
```

---

## Final self-check (run before declaring done)

- [ ] `node --test` passes with zero failures.
- [ ] `scripts/appversion.js` has no third-party `require`s (only `fs`, `path`, `child_process`, `./trackers`).
- [ ] Every file in the File Structure table exists.
- [ ] `SKILL.md` frontmatter has `name: appversion` and a `description`.
- [ ] Running `node scripts/appversion.js bump minor` in a scratch repo updates `appversion.json` + `package.json` and prints the new version.
