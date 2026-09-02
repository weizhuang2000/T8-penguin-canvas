'use strict';

/** LibreChat is embedded in T8 and must not expose a second account system. */
module.exports = function rejectT8StandaloneAuth(_req, res) {
  return res.status(403).json({ message: '请通过 T8 登录，LibreChat 独立账户功能已禁用。' });
};
