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
