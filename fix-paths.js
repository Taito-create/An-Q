const fs = require('fs');
const path = require('path');

const BASE = '/An-Q';
const indexPath = path.join(__dirname, 'dist', 'index.html');

let html = fs.readFileSync(indexPath, 'utf8');

// /_expo/ → /An-Q/_expo/
html = html.replace(/src="\/_expo\//g, `src="${BASE}/_expo/`);
// /favicon.ico → /An-Q/favicon.ico
html = html.replace(/href="\/favicon\.ico"/g, `href="${BASE}/favicon.ico"`);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ Paths fixed in dist/index.html');
