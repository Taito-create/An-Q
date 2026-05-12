#!/bin/bash

# GitHub Pages デプロイスクリプト
echo "🚀 GitHub Pages デプロイ開始..."

# 1. ビルド
echo "📦 Expo Webアプリをビルド中..."
npx expo export -p web

# 2. distフォルダに移動
echo "📁 ビルドファイルを整理中..."
cd dist

# 3. .nojekyllファイル作成（GitHub PagesでJekyllを無効化）
touch .nojekyll

# 4. 404.htmlをコピー
echo "📄 404.htmlを配置中..."
cp ../404.html .

# 5. robots.txtをコピー
echo "🤖 robots.txtを配置中..."
cp ../robots.txt .

# 6. manifest.jsonのパスを修正
echo "⚙️ manifest.jsonを最適化中..."
sed -i '' 's/"assets\/icon-/"\.\/icon-/g' manifest.json

# 7. git commit & push
echo "📤 GitHubにデプロイ中..."
git add .
git commit -m "Deploy to GitHub Pages - $(date)"
git push origin main

echo "✅ デプロイ完了！"
echo "🌐 https://[USERNAME].github.io/[REPOSITORY]/ で確認してください"
