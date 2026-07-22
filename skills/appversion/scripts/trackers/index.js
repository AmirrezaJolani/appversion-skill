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
