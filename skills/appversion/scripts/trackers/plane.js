'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createPlane(cfg) {
  const host = (cfg.host || '').replace(/\/$/, '');
  const workspace = cfg.workspace || '';
  const prefixes = cfg.keyPrefixes || [];
  const idRe = prefixes.length
    ? new RegExp(`\\b(?:${prefixes.map(escapeRe).join('|')})-\\d+\\b`, 'g')
    : /\b[A-Z][A-Z0-9]+-\d+\b/g;

  return {
    name: 'plane',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const token = process.env.PLANE_API_TOKEN;
      if (!host || !workspace || !token) return null;
      const url = `${host}/api/v1/workspaces/${workspace}/issues/${id}/`;
      try {
        const res = await fetch(url, { headers: { 'X-API-Key': token, Accept: 'application/json' } });
        if (!res.ok) return null;
        const d = await res.json();
        return {
          id,
          title: d.name,
          type: d.priority || null,
          status: d.state_detail && d.state_detail.name,
          url: `${host}/${workspace}/browse/${id}`,
          provider: 'plane',
        };
      } catch { return null; }
    },
  };
};
