# GitHub Pages デプロイスクリプト (PowerShell)
Write-Host "🚀 GitHub Pages デプロイ開始..." -ForegroundColor Green

# 1. ビルド
Write-Host "📦 Expo Webアプリをビルド中..." -ForegroundColor Yellow
npx expo export -p web

# 2. distフォルダに移動
Write-Host "📁 ビルドファイルを整理中..." -ForegroundColor Yellow
Set-Location dist

# 3. .nojekyllファイル作成（GitHub PagesでJekyllを無効化）
New-Item -Path .nojekyll -ItemType File -Force | Out-Null

# 4. 404.htmlをコピー
Write-Host "📄 404.htmlを配置中..." -ForegroundColor Yellow
Copy-Item ../404.html . -Force

# 5. robots.txtをコピー
Write-Host "🤖 robots.txtを配置中..." -ForegroundColor Yellow
Copy-Item ../robots.txt . -Force

# 6. manifest.jsonのパスを修正
Write-Host "⚙️ manifest.jsonを最適化中..." -ForegroundColor Yellow
(Get-Content manifest.json) -replace '"assets/icon-', '"./icon-' | Set-Content manifest.json

# 7. git commit & push
Write-Host "📤 GitHubにデプロイ中..." -ForegroundColor Yellow
git add .
git commit -m "Deploy to GitHub Pages - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push origin main

Write-Host "✅ デプロイ完了！" -ForegroundColor Green
Write-Host "🌐 https://[USERNAME].github.io/[REPOSITORY]/ で確認してください" -ForegroundColor Cyan

# 元のフォルダに戻る
Set-Location ..
