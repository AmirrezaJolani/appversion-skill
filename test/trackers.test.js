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
