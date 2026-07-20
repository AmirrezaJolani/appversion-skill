'use strict';

module.exports = function createShortcut(cfg) {
  const idRe = /\bsc-\d+\b/gi;
  return {
    name: 'shortcut',
    keyPrefixes: cfg.keyPrefixes || [],
    detectIds(text) { return [...new Set(String(text).match(idRe) || [])]; },
    async getTicket(id) {
      const token = process.env.SHORTCUT_API_TOKEN;
      if (!token) return null;
      const num = String(id).replace(/\D/g, '');
      try {
        const res = await fetch(`https://api.app.shortcut.com/api/v3/stories/${num}`, {
          headers: { 'Shortcut-Token': token, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const d = await res.json();
        return {
          id,
          title: d.name,
          type: d.story_type,
          status: d.completed ? 'completed' : (d.started ? 'started' : 'unstarted'),
          url: d.app_url,
          provider: 'shortcut',
        };
      } catch { return null; }
    },
  };
};
