const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metroサーバーのレスポンスを直接制御
config.server = {
  ...config.server,
  modifyResponseHeaders: (req, res, headers) => {
    // entry.bundleリクエストに対してMIME typeを強制設定
    if (req.url && req.url.includes('entry.bundle')) {
      return {
        ...headers,
        'Content-Type': 'application/javascript',
        'X-Content-Type-Options': 'nosniff'
      };
    }
    return headers;
  }
};

module.exports = config;
