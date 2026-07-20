#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
      default:
        throw new Error(`unknown command: ${command || '(none)'} ` +
          `(expected init|show|bump|build|status|tickets)`);
    }
  } catch (err) {
    process.stderr.write(`appversion: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { SCHEMA_VERSION, template, avPath, writeJson, readAv, initFile, versionString, statusString, show, applyBump, today, applyBuild, applyStatus, refreshBadges, propagate, stampCommit, parseArgs, ticketsCommand, main };

if (require.main === module) main(process.argv);
