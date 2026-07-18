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

module.exports = { SCHEMA_VERSION, template, avPath, writeJson, readAv, initFile, versionString, statusString, show, applyBump };
