'use strict';
module.exports = function(cfg){ return { name: 'linear', keyPrefixes: cfg.keyPrefixes||[], detectIds(){return [];}, async getTicket(){return null;} }; };
