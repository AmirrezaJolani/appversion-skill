#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const trackers = require('./trackers');

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

function applyBump(av, level) {
  const v = av.version;
  if (level === 'major') { v.major += 1; v.minor = 0; v.patch = 0; }
  else if (level === 'minor') { v.minor += 1; v.patch = 0; }
  else if (level === 'patch') { v.patch += 1; }
  else throw new Error(`invalid bump level: ${level} (expected major|minor|patch)`);
  av.build.number = 0;
  return versionString(av);
}

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

function defaultGitRunner(dir) {
  // stderr ignored: "no commits yet" / "not a git repo" are handled by the caller,
  // so git's fatal: line would only look like a failure that did not happen.
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
    { cwd: dir || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
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

// ---- versioning intelligence: infer the level, enforce sync ----

function inferLevel(messages) {
  if (!messages || messages.length === 0) return null;
  let sawFeat = false;
  for (const m of messages) {
    const subject = String(m).split('\n')[0].trim();
    // BREAKING CHANGE must be a footer (own line, with colon) — prose or a branch
    // name merely mentioning the phrase must not force a major bump.
    if (/^[a-z]+(\([^)]*\))?!:/i.test(subject) || /^BREAKING[ -]CHANGE:/m.test(m)) return 'major';
    if (/^feat(\([^)]*\))?:/i.test(subject)) sawFeat = true;
  }
  return sawFeat ? 'minor' : 'patch';
}

function defaultTagRunner(dir) {
  // execFileSync: args go straight to git with no shell, so nothing can inject.
  // stderr ignored: "no tag yet" is an expected first-release case, not an error to surface.
  return execFileSync('git', ['describe', '--tags', '--match', 'v*', '--abbrev=0'],
    { cwd: dir || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

function lastVersionRef(runner) {
  try { const t = (runner || (() => defaultTagRunner()))(); return t ? t.trim() : null; }
  catch { return null; }
}

function defaultLogRunner(ref, dir) {
  // `range` is one git argument (execFileSync, no shell) — cannot inject
  const range = ref ? `${ref}..HEAD` : 'HEAD';
  // stderr ignored: an empty repo is an expected case handled by commitsSince
  return execFileSync('git', ['log', range, '--format=%B%x00'],
    { cwd: dir || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

function commitsSince(ref, runner) {
  let raw;
  try { raw = (runner || (() => defaultLogRunner(ref)))(); }
  catch { return []; }
  return String(raw).split('\0').map((s) => s.trim()).filter(Boolean);
}

function checkSync(av, dir) {
  const version = versionString(av);
  const root = dir || process.cwd();
  const mismatches = [];
  for (const rel of ['package.json', ...(av.config.json || [])]) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!Object.prototype.hasOwnProperty.call(data, 'version')) continue;
    if (data.version !== version) mismatches.push({ file: rel, found: data.version, expected: version });
  }
  return mismatches;
}

// Where the pre-push hook belongs. Read-only, so --dry-run can preview the real
// destination instead of guessing `.git/hooks`.
function resolveHookPath(dir) {
  const root = dir || process.cwd();
  let hooksDir;
  try {
    // --git-path honors core.hooksPath and linked-worktree/submodule layouts
    const p = execFileSync('git', ['rev-parse', '--git-path', 'hooks'],
      { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    hooksDir = path.isAbsolute(p) ? p : path.join(root, p);
  } catch {
    throw new Error('git hooks directory not found (run inside a git repo)');
  }
  return path.join(hooksDir, 'pre-push');
}

function installHook(dir) {
  const hookPath = resolveHookPath(dir);
  const line = `node "${path.join(__dirname, 'appversion.js')}" check --path .`;
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes('appversion.js') && existing.includes('check')) return hookPath;
    throw new Error(`a pre-push hook already exists at ${hookPath}; add this line manually:\n  ${line}`);
  }
  // created only once we know we will write: a refused foreign hook leaves no empty dir
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, `#!/bin/sh\n# appversion: block push when versions drift\nexec ${line}\n`);
  fs.chmodSync(hookPath, 0o755);
  return hookPath;
}

// ---- git tag + GitHub Release ----

function gitTagExists(tag, dir) {
  try {
    const out = execFileSync('git', ['tag', '--list', tag], { cwd: dir || process.cwd() }).toString().trim();
    return out === tag;
  } catch { return false; }
}

function createTag(tag, message, dir) {
  if (gitTagExists(tag, dir)) throw new Error(`tag ${tag} already exists`);
  execFileSync('git', ['tag', '-a', tag, '-m', message || `Release ${tag}`], { cwd: dir || process.cwd() });
  return tag;
}

function pushTag(tag, dir) {
  execFileSync('git', ['push', 'origin', tag], { cwd: dir || process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  return tag;
}

function deleteLocalTag(tag, dir) {
  try { execFileSync('git', ['tag', '-d', tag], { cwd: dir || process.cwd(), stdio: 'ignore' }); }
  catch { /* best-effort cleanup */ }
}

// Push a tag. Clean up ONLY when the remote actually rejected the ref AND we created
// the tag in this invocation — a missing remote, bad auth, or network failure must
// leave the tag (its annotation holds the approved changelog body) and surface git's
// own reason instead of a guess.
function pushTagOrCleanUp(tag, dir, createdHere) {
  try { pushTag(tag, dir); }
  catch (err) {
    const stderr = String((err && err.stderr) || '');
    const rejected = /already exists|\[rejected\]|non-fast-forward/i.test(stderr);
    if (rejected) {
      if (createdHere) deleteLocalTag(tag, dir);
      throw new Error(`the remote already has ${tag}` +
        (createdHere ? ' (the local tag created just now was removed)' : '') +
        ` — bump the version or reconcile the tag`);
    }
    throw new Error(`pushing ${tag} failed; the local tag was kept.\n${stderr.trim()}`);
  }
}

function ghAvailable() {
  try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// Pure: build the `gh release create` argument vector (unit-testable without invoking gh)
function ghReleaseArgs(tag, { notesFile, notes } = {}) {
  const a = ['release', 'create', tag];
  if (notesFile) a.push('--notes-file', notesFile);
  else if (notes) a.push('--notes', notes);
  else a.push('--generate-notes');
  return a;
}

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

// Flags that take a value, mapped to their opts key. Values are stored in opts —
// never pushed into positional args — so a value can never be mistaken for a flag
// (e.g. `--message --push` must not be read as "push"). A missing value is an
// error rather than silently eating the next flag: swallowing `--dry-run` would
// turn a requested preview into a real push + GitHub Release.
const VALUE_FLAGS = {
  '--path': 'path',
  '--message': 'message',
  '--notes': 'notes',
  '--notes-file': 'notesFile',
};

function parseArgs(argv) {
  const rest = argv.slice(2);
  const opts = { path: process.cwd(), json: false, dryRun: false, message: null, notes: null, notesFile: null };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const eq = a.indexOf('=');
    if (a === '--json') { opts.json = true; }
    else if (a === '--dry-run') { opts.dryRun = true; }
    else if (eq > 0 && VALUE_FLAGS[a.slice(0, eq)]) {
      // --flag=value carries values that legitimately start with dashes
      opts[VALUE_FLAGS[a.slice(0, eq)]] = a.slice(eq + 1);
    }
    else if (VALUE_FLAGS[a]) {
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${a} requires a value (use ${a}=<value> if the value starts with --)`);
      }
      opts[VALUE_FLAGS[a]] = next;
      i += 1;
    }
    else { positional.push(a); }
  }
  return { command: positional[0], args: positional.slice(1), opts };
}

function commitAv(av, opts) {
  if (opts.dryRun) { console.log(`would write ${avPath(opts.path)}`); return; }
  writeJson(avPath(opts.path), av);
}

function main(argv) {
  try {
    // inside the try so a bad flag reports cleanly instead of throwing a stack trace
    const { command, args, opts } = parseArgs(argv);
    switch (command) {
      case 'init': {
        if (opts.dryRun) {
          console.log(`would create ${avPath(opts.path)}`);
          break;
        }
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
        const LEVELS = ['major', 'minor', 'patch'];
        let level = args.find((a) => LEVELS.includes(a));
        if (!level && args.includes('--auto')) {
          const ref = lastVersionRef(() => defaultTagRunner(opts.path));
          const msgs = commitsSince(ref, () => defaultLogRunner(ref, opts.path));
          level = inferLevel(msgs);
          if (!level) {
            console.log(`nothing to release since ${ref || 'start'} (no commits)`);
            break;
          }
          process.stderr.write(
            `appversion: auto-detected ${level} from ${msgs.length} commit(s) since ${ref || 'start'}\n`);
        }
        if (!level) throw new Error('bump needs a level (major|minor|patch) or --auto');
        applyBump(data, level);
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
      case 'check': {
        // Absent file is not drift: `check` runs as a pre-push hook, so it must not
        // block pushes on branches that predate appversion.json.
        if (!fs.existsSync(avPath(opts.path))) {
          console.log('no appversion.json — nothing to verify');
          break;
        }
        const data = readAv(opts.path);
        const mism = checkSync(data, opts.path);
        if (mism.length) {
          for (const m of mism) {
            process.stderr.write(`appversion: ${m.file} is ${m.found}, expected ${m.expected}\n`);
          }
          process.stderr.write('appversion: version drift — run `appversion sync` or `appversion bump`\n');
          process.exit(1);
        }
        console.log(`in sync at ${versionString(data)}`);
        break;
      }
      case 'sync': {
        const data = readAv(opts.path);
        propagate(data, opts.path, opts);
        refreshBadges(data, opts.path, opts);
        console.log(opts.dryRun ? 'dry-run: no changes written' : `synced to ${versionString(data)}`);
        break;
      }
      case 'install-hook': {
        if (opts.dryRun) {
          // resolveHookPath throws outside a repo, matching the real run's behavior
          console.log(`would install pre-push hook at ${resolveHookPath(opts.path)}`);
          break;
        }
        console.log(`installed pre-push hook at ${installHook(opts.path)}`);
        break;
      }
      case 'tag': {
        const data = readAv(opts.path);
        const tag = `v${versionString(data)}`;
        const push = args.includes('--push');
        if (opts.dryRun) { console.log(`would tag ${tag}${push ? ' and push it' : ''}`); break; }
        createTag(tag, opts.message || `Release ${tag}`, opts.path);
        if (push) pushTagOrCleanUp(tag, opts.path, true);
        console.log(push ? `tagged and pushed ${tag}` : `tagged ${tag}`);
        break;
      }
      case 'release': {
        const data = readAv(opts.path);
        const tag = `v${versionString(data)}`;
        const ghArgs = ghReleaseArgs(tag, {
          notesFile: opts.notesFile || undefined,
          notes: opts.notes || undefined,
        });
        if (opts.dryRun) { console.log(`would release ${tag} via: gh ${ghArgs.join(' ')}`); break; }
        if (!ghAvailable()) throw new Error('gh CLI not found or not on PATH; install it or create the Release manually');
        const hadTag = gitTagExists(tag, opts.path);
        if (!hadTag) createTag(tag, `Release ${tag}`, opts.path);
        pushTagOrCleanUp(tag, opts.path, !hadTag);
        execFileSync('gh', ghArgs, { cwd: opts.path, stdio: ['ignore', 'pipe', 'pipe'] });
        console.log(`released ${tag}`);
        break;
      }
      default:
        throw new Error(`unknown command: ${command || '(none)'} ` +
          `(expected init|show|bump|build|status|tickets|check|sync|install-hook|tag|release)`);
    }
  } catch (err) {
    process.stderr.write(`appversion: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { SCHEMA_VERSION, template, avPath, writeJson, readAv, initFile, versionString, statusString, show, applyBump, today, applyBuild, applyStatus, refreshBadges, propagate, stampCommit, inferLevel, lastVersionRef, commitsSince, checkSync, resolveHookPath, installHook, gitTagExists, createTag, pushTag, pushTagOrCleanUp, ghAvailable, ghReleaseArgs, parseArgs, ticketsCommand, main };

if (require.main === module) main(process.argv);
