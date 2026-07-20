'use strict';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = function createLinear(cfg) {
  const prefixes = cfg.keyPrefixes || [];
  const idRe = prefixes.length
    ? new RegExp(`\\b(?:${prefixes.map(escapeRe).join('|')})-\\d+\\b`, 'g')
    : /\b[A-Z][A-Z0-9]+-\d+\b/g;

  return {
    name: 'linear',
    keyPrefixes: prefixes,
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const key = process.env.LINEAR_API_KEY;
      if (!key) return null;
      const query = `query($id:String!){ issue(id:$id){ identifier title url state{ name } labels{ nodes{ name } } } }`;
      try {
        const res = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: { Authorization: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { id } }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const issue = json.data && json.data.issue;
        if (!issue) return null;
        const labels = (issue.labels && issue.labels.nodes) || [];
        return {
          id: issue.identifier || id,
          title: issue.title,
          type: labels.length ? labels[0].name : 'issue',
          status: issue.state && issue.state.name,
          url: issue.url,
          provider: 'linear',
        };
      } catch { return null; }
    },
  };
};
