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
