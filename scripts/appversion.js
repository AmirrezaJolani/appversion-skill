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
