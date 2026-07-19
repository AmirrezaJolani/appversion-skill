'use strict';
module.exports = function(cfg){ return { name: 'shortcut', keyPrefixes: cfg.keyPrefixes||[], detectIds(){return [];}, async getTicket(){return null;} }; };
