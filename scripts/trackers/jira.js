'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createJira(cfg) {
  const host = (cfg.host || '').replace(/\/$/, '');
  const prefixes = cfg.keyPrefixes || [];
  const idRe = prefixes.length
    ? new RegExp(`\\b(?:${prefixes.map(escapeRe).join('|')})-\\d+\\b`, 'g')
    : /\b[A-Z][A-Z0-9]+-\d+\b/g;

  return {
    name: 'jira',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const email = process.env.JIRA_EMAIL;
      const token = process.env.JIRA_API_TOKEN;
      if (!host || !email || !token) return null;
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      try {
        const res = await fetch(`${host}/rest/api/3/issue/${id}?fields=summary,issuetype,status`, {
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          id,
          title: data.fields.summary,
          type: data.fields.issuetype && data.fields.issuetype.name,
          status: data.fields.status && data.fields.status.name,
          url: `${host}/browse/${id}`,
          provider: 'jira',
        };
      } catch { return null; }
    },
  };
};
