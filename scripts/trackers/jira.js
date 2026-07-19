'use strict';
module.exports = function(cfg){ return { name: 'jira', keyPrefixes: cfg.keyPrefixes||[], detectIds(){return [];}, async getTicket(){return null;} }; };
