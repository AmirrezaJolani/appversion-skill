'use strict';
module.exports = function(cfg){ return { name: 'clickup', keyPrefixes: cfg.keyPrefixes||[], detectIds(){return [];}, async getTicket(){return null;} }; };
