'use strict';
module.exports = function(cfg){ return { name: 'plane', keyPrefixes: cfg.keyPrefixes||[], detectIds(){return [];}, async getTicket(){return null;} }; };
