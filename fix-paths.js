const fs = require('fs');
const path = require('path');

const BASE = '/An-Q';

// index.html のパス修正
const indexPath = path.join(__dirname, 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/src="\/_expo\//g, `src="${BASE}/_expo/`);
html = html.replace(/href="\/favicon\.ico"/g, `href="${BASE}/favicon.ico"`);
fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ Paths fixed in dist/index.html');

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
