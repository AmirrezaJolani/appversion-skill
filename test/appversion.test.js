'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const av = require('../skills/appversion/scripts/appversion.js');

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

test('today formats DD.MM.YYYY from local date parts', () => {
  assert.strictEqual(av.today(new Date(2026, 6, 8)), '08.07.2026'); // month is 0-indexed
});

test('applyBuild increments number + total and stamps the date', () => {
  const d = av.template();
  d.build = { date: null, number: 2, total: 5 };
  av.applyBuild(d, new Date(2026, 6, 18));
  assert.deepStrictEqual(d.build, { date: '18.07.2026', number: 3, total: 6 });
});

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

const { execFileSync } = require('child_process');
const CLI = path.join(__dirname, '..', 'skills', 'appversion', 'scripts', 'appversion.js');

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

test('CLI init --dry-run does not create appversion.json', () => {
  const dir = tmp();
  // exits 0 because runCli (execFileSync) throws on any non-zero exit code
  runCli(['init', '--path', dir, '--dry-run']);
  assert.strictEqual(fs.existsSync(path.join(dir, 'appversion.json')), false);
});

test('CLI bump --dry-run leaves appversion.json, package.json, and markdown badge untouched', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);

  const pkgFile = path.join(dir, 'package.json');
  fs.writeFileSync(pkgFile, JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2) + '\n');

  const readmeFile = path.join(dir, 'README.md');
  fs.writeFileSync(readmeFile,
    '# Demo\n![version](https://img.shields.io/badge/version-0.0.0-green.svg)\n');

  const avFile = path.join(dir, 'appversion.json');
  const data = av.readAv(dir);
  data.config.markdown = ['README.md'];
  data.config.json = [];
  av.writeJson(avFile, data);

  const avBefore = fs.readFileSync(avFile, 'utf8');
  const pkgBefore = fs.readFileSync(pkgFile, 'utf8');
  const readmeBefore = fs.readFileSync(readmeFile, 'utf8');

  runCli(['bump', 'minor', '--path', dir, '--dry-run']);

  assert.strictEqual(fs.readFileSync(avFile, 'utf8'), avBefore);
  assert.strictEqual(fs.readFileSync(pkgFile, 'utf8'), pkgBefore);
  assert.strictEqual(fs.readFileSync(readmeFile, 'utf8'), readmeBefore);
});

test('CLI exits non-zero on unknown command', () => {
  assert.throws(() => runCli(['frobnicate']), /Command failed/);
});

test('CLI exits non-zero when bumping without appversion.json', () => {
  const dir = tmp();
  assert.throws(() => runCli(['bump', 'patch', '--path', dir]), /Command failed/);
});

test('CLI exits non-zero when appversion.json is malformed', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'appversion.json'), '{ not json');
  assert.throws(() => runCli(['show', 'version', '--path', dir]), /Command failed/);
});

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

// ---- versioning intelligence: infer level + enforce sync ----

test('inferLevel maps conventional commits to a semver level', () => {
  assert.strictEqual(av.inferLevel(['feat: add export']), 'minor');
  assert.strictEqual(av.inferLevel(['fix: off-by-one']), 'patch');
  assert.strictEqual(av.inferLevel(['chore: deps', 'feat: thing']), 'minor'); // highest wins
  assert.strictEqual(av.inferLevel(['feat!: drop old api']), 'major');
  assert.strictEqual(av.inferLevel(['fix: x\n\nBREAKING CHANGE: nope']), 'major');
  assert.strictEqual(av.inferLevel(['refactor: tidy']), 'patch'); // commits exist -> at least patch
  assert.strictEqual(av.inferLevel([]), null); // nothing to release
});

test('checkSync flags package.json that drifts from appversion.json, passes when equal', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }, null, 2));
  assert.strictEqual(av.checkSync(av.readAv(dir), dir).length, 0); // both 0.0.0

  const data = av.readAv(dir);
  data.version = { major: 0, minor: 2, patch: 0 };
  av.writeJson(path.join(dir, 'appversion.json'), data);
  const mism = av.checkSync(av.readAv(dir), dir);
  assert.strictEqual(mism.length, 1);
  assert.strictEqual(mism[0].found, '0.0.0');
  assert.strictEqual(mism[0].expected, '0.2.0');
});

test('CLI check exits non-zero on drift and zero when synced', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }, null, 2));
  runCli(['check', '--path', dir]); // in sync -> does not throw
  const data = av.readAv(dir);
  data.version = { major: 1, minor: 0, patch: 0 };
  av.writeJson(path.join(dir, 'appversion.json'), data);
  assert.throws(() => runCli(['check', '--path', dir]), /Command failed/); // drift -> exit 1
});

test('CLI sync repairs package.json to the appversion.json version', () => {
  const dir = tmp();
  runCli(['init', '--path', dir]);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }, null, 2));
  const data = av.readAv(dir);
  data.version = { major: 1, minor: 0, patch: 0 };
  av.writeJson(path.join(dir, 'appversion.json'), data);
  runCli(['sync', '--path', dir]);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '1.0.0');
});

test('CLI bump --auto infers the level from commits and applies it (+ package.json)', () => {
  const dir = tmp();
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.co']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
  runCli(['init', '--path', dir]);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }, null, 2));
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'chore: baseline']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-qm', 'feat: add thing']);
  const out = runCli(['bump', '--auto', '--path', dir]).trim();
  assert.strictEqual(out, '0.1.0'); // feat -> minor
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '0.1.0');
});

test('installHook writes an executable pre-push hook that runs check', () => {
  const dir = tmp();
  execFileSync('git', ['init', '-q', dir]);
  const hook = av.installHook(dir);
  assert.ok(fs.existsSync(hook));
  const body = fs.readFileSync(hook, 'utf8');
  assert.match(body, /appversion\.js/);
  assert.match(body, /check/);
  assert.ok((fs.statSync(hook).mode & 0o111) !== 0); // executable bit set
});

// ---- git tag + GitHub Release ----

test('ghReleaseArgs builds the gh argv (notes-file, notes, or --generate-notes)', () => {
  assert.deepStrictEqual(av.ghReleaseArgs('v1.2.0', { notesFile: 'N.md' }),
    ['release', 'create', 'v1.2.0', '--notes-file', 'N.md']);
  assert.deepStrictEqual(av.ghReleaseArgs('v1.2.0', { notes: 'hi' }),
    ['release', 'create', 'v1.2.0', '--notes', 'hi']);
  assert.deepStrictEqual(av.ghReleaseArgs('v1.2.0'),
    ['release', 'create', 'v1.2.0', '--generate-notes']);
});

function gitRepoAt(version) {
  const dir = tmp();
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.co']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
  runCli(['init', '--path', dir]);
  const data = av.readAv(dir);
  const [maj, min, pat] = version.split('.').map(Number);
  data.version = { major: maj, minor: min, patch: pat };
  av.writeJson(path.join(dir, 'appversion.json'), data);
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'chore: base']);
  return dir;
}

test('createTag makes an annotated tag and refuses to clobber an existing one', () => {
  const dir = gitRepoAt('1.2.0');
  av.createTag('v1.2.0', 'Release v1.2.0', dir);
  assert.ok(av.gitTagExists('v1.2.0', dir));
  assert.throws(() => av.createTag('v1.2.0', 'again', dir), /already exists/);
});

test('CLI tag creates v<version> from appversion.json', () => {
  const dir = gitRepoAt('2.3.4');
  const out = runCli(['tag', '--path', dir]).trim();
  assert.strictEqual(out, 'tagged v2.3.4');
  assert.ok(av.gitTagExists('v2.3.4', dir));
});

test('CLI tag --dry-run creates no tag', () => {
  const dir = gitRepoAt('0.5.0');
  const out = runCli(['tag', '--dry-run', '--push', '--path', dir]).trim();
  assert.match(out, /would tag v0\.5\.0 and push it/);
  assert.strictEqual(av.gitTagExists('v0.5.0', dir), false);
});

test('CLI tag --push pushes the tag to origin', () => {
  const remote = tmp();
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const dir = gitRepoAt('1.0.0');
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
  runCli(['tag', '--push', '--path', dir]);
  const remoteTags = execFileSync('git', ['-C', remote, 'tag', '--list'], { encoding: 'utf8' }).trim();
  assert.strictEqual(remoteTags, 'v1.0.0');
});
