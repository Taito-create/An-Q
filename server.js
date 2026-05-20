const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = 8081;

// MIME typeを正しく設定するミドルウェア
app.use((req, res, next) => {
  // JavaScriptファイルのMIME typeを強制設定
  if (req.url && (req.url.endsWith('.bundle') || req.url.includes('.bundle?'))) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  
  // すべてのJSファイルに対してMIME typeを設定
  if (req.url && (req.url.endsWith('.js') || req.url.includes('.js?'))) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  
  next();
});

// Expo開発サーバーにプロキシ
const expoProxy = createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  ws: true,
});

app.use('/', expoProxy);

app.listen(port, () => {
  console.log(`Custom server running on port ${port}`);
});
