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
