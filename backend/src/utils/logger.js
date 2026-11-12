'use strict';
const config = require('../config/env');
const line = (level, msg, extra) => {
  if (config.isTest) return;
  const entry = { time: new Date().toISOString(), level, msg, ...(extra || {}) };
  (level === 'error' ? console.error : console.log)(JSON.stringify(entry));
};
module.exports = {
  info: (m, e) => line('info', m, e),
  warn: (m, e) => line('warn', m, e),
  error: (m, e) => line('error', m, e),
};
