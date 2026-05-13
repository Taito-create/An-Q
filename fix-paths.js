const fs = require('fs');
const path = require('path');

const BASE = '/An-Q';

// index.html のパス修正
const indexPath = path.join(__dirname, 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/src="\/_expo\//g, `src="${BASE}/_expo/`);
html = html.replace(/href="\/favicon\.ico"/g, `href="${BASE}/favicon.ico"`);
// GitHub Pages SPA: 404.html から渡されたパスを history に復元するスクリプトを追加
// Expo Router が初期化される前に URL を正しいパスに戻す必要があるため、
// <meta charset> の直後（最初）に挿入する
if (!html.includes('history.replaceState')) {
  const spaScript =
    `    <!-- GitHub Pages SPA: 404.html から渡されたパスを history に復元 -->\n` +
    `    <!-- Expo Router が初期化される前に URL を正しいパスに戻す必要がある -->\n` +
    `    <script>\n` +
    `      (function() {\n` +
    `        var p = new URLSearchParams(window.location.search).get('p');\n` +
    `        if (p) {\n` +
    `          var base = '${BASE}';\n` +
    `          var decoded = decodeURIComponent(p);\n` +
    `          var newUrl = base + decoded;\n` +
    `          window.history.replaceState(null, '', newUrl);\n` +
    `        }\n` +
    `      })();\n` +
    `    </script>\n`;
  // <meta charset> タグの直後に挿入
  html = html.replace(
    /(<meta charset[^>]+\/>)/,
    `$1\n${spaScript}`
  );
}
// manifest リンクと PWA メタタグを追加（まだない場合）
if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '</head>',
    `<link rel="manifest" href="${BASE}/manifest.json" />\n` +
    `<meta name="theme-color" content="#6366f1" />\n` +
    `<meta name="apple-mobile-web-app-capable" content="yes" />\n` +
    `<meta name="apple-mobile-web-app-status-bar-style" content="default" />\n` +
    `<meta name="apple-mobile-web-app-title" content="An-Q" />\n` +
    `<link rel="apple-touch-icon" href="${BASE}/icon-192.png" />\n` +
    `</head>`
  );
}
// Service Worker 登録スクリプトを追加（まだない場合）
if (!html.includes('serviceWorker')) {
  html = html.replace(
    '</body>',
    `<script>\n` +
    `  if ('serviceWorker' in navigator) {\n` +
    `    window.addEventListener('load', function() {\n` +
    `      navigator.serviceWorker.register('${BASE}/sw.js', { scope: '${BASE}/' })\n` +
    `        .then(function(reg) { console.log('SW registered:', reg.scope); })\n` +
    `        .catch(function(err) { console.log('SW registration failed:', err); });\n` +
    `    });\n` +
    `  }\n` +
    `</script>\n` +
    `</body>`
  );
}
fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ Paths fixed in dist/index.html');

// manifest.json の start_url / scope / icon パスを修正
const manifestPath = path.join(__dirname, 'dist', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.start_url = `${BASE}/`;
  manifest.scope = `${BASE}/`;
  if (!manifest.description) manifest.description = '有明高専 専用クイズアプリ';
  if (!manifest.lang) manifest.lang = 'ja';
  if (!manifest.orientation) manifest.orientation = 'portrait';
  // アイコンパスを BASE 付きに修正
  if (manifest.icons) {
    manifest.icons = manifest.icons.map(icon => ({
      ...icon,
      src: icon.src.startsWith(BASE) ? icon.src : `${BASE}${icon.src.startsWith('/') ? '' : '/'}${icon.src}`,
    }));
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('✅ manifest.json start_url/scope/icons fixed');
}

// sw.js の BASE_URL を修正
const swPath = path.join(__dirname, 'dist', 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  // start_url が '/' のままなら BASE に置換
  sw = sw.replace(/const BASE_URL = '\/';/, `const BASE_URL = '${BASE}/';`);
  // キャッシュリストの '/' を BASE に置換（sw.js が古い形式の場合）
  sw = sw.replace(/'\/manifest\.json'/g, `'${BASE}/manifest.json'`);
  sw = sw.replace(/'\/icon-192\.png'/g, `'${BASE}/icon-192.png'`);
  fs.writeFileSync(swPath, sw, 'utf8');
  console.log('✅ sw.js BASE_URL fixed');
}

// node_modules/@xxx フォルダを assets/npm/ にコピー（@を除去）
const srcNodeModules = path.join(__dirname, 'dist', 'assets', 'node_modules');
const dstNodeModules = path.join(__dirname, 'dist', 'assets', 'npm');

function copyDirSync(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// @xxx → xxx に変換してコピー
if (fs.existsSync(srcNodeModules)) {
  for (const entry of fs.readdirSync(srcNodeModules)) {
    const cleanName = entry.startsWith('@') ? entry.slice(1) : entry;
    copyDirSync(
      path.join(srcNodeModules, entry),
      path.join(dstNodeModules, cleanName)
    );
  }
  console.log('✅ node_modules copied to assets/npm/ (@ removed)');
}

// JS バンドルファイルのパス修正
const jsDir = path.join(__dirname, 'dist', '_expo', 'static', 'js', 'web');
if (fs.existsSync(jsDir)) {
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  files.forEach(file => {
    const filePath = path.join(jsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    // "/assets/ → "/An-Q/assets/ に置換（既に /An-Q/ が付いているものは除外）
    content = content.replace(/(?<!\/(An-Q))"\/assets\//g, `"${BASE}/assets/`);
    // /An-Q/assets/node_modules/@xxx → /An-Q/assets/npm/xxx
    content = content.replace(/\/An-Q\/assets\/node_modules\/@/g, `${BASE}/assets/npm/`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Paths fixed in ${file}`);
  });
}
