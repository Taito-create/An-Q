# GitHub Pages デプロイ詳細手順

## 🔧 事前準備チェックリスト

### 1. Firebaseプロジェクト設定
- [ ] Firebaseコンソールでプロジェクト作成済み
- [ ] Authentication > Sign-in method で「メール/パスワード」を有効化
- [ ] Firestore Database を作成済み
- [ ] APIキーと設定情報を取得済み

### 2. 環境変数設定
- [ ] `.env.example` をコピーして `.env` を作成
- [ ] `.env` に正しいFirebase設定を記述
- [ ] `ADMIN_EMAIL` を実際の管理者メールに変更

### 3. GitHubリポジトリ設定
- [ ] GitHubリポジトリを作成済み
- [ ] Settings > Pages で「Deploy from a branch」を選択
- [ ] Source: 「main」ブランチ、Folder: 「/(root)」を設定

## 📦 デプロイ手順

### ステップ1: ローカルテスト
```bash
# 1. 依存関係を最新化
npm install

# 2. Expo Webアプリをテスト
npx expo start --web --clear

# 3. http://localhost:19006 で動作確認
# - ログイン機能が動作するか
# - PWAインストールが可能か
# - Service Workerが動作するか
```

### ステップ2: ビルド
```bash
# 1. クリーンビルド
npx expo export -p web

# 2. distフォルダの内容確認
ls -la dist/
# 以下のファイルが存在することを確認
# - index.html
# - manifest.json
# - sw.js
# - assets/
```

### ステップ3: デプロイファイル準備
```bash
# 1. distフォルダに移動
cd dist

# 2. GitHub Pages用ファイルを配置
cp ../404.html .
cp ../robots.txt .
touch .nojekyll

# 3. manifest.jsonのパス修正（重要）
sed -i 's/"assets\/icon-/"\.\/icon-/g' manifest.json
```

### ステップ4: Git操作
```bash
# 1. 変更をコミット
git add .
git commit -m "Deploy to GitHub Pages - $(date '+%Y-%m-%d %H:%M:%S')"

# 2. GitHubにプッシュ
git push origin main

# 3. GitHub Pagesがビルド完了するまで待機（1-2分）
```

## 🔍 デプロイ後の確認項目

### 基本動作確認
- [ ] https://[USERNAME].github.io/[REPOSITORY]/ にアクセスできる
- [ ] トップページが正しく表示される
- [ ] PWAインストールプロンプトが表示される
- [ ] Service Workerが登録される

### 認証機能確認
- [ ] ログイン画面に遷移できる
- [ ] @ga.ariake-nct.ac.jp 以外のメールでエラーが表示される
- [ ] 正しいメールアドレスでログインできる
- [ ] 新規登録ができる

### エラーハンドリング確認
- [ ] 404ページが正しく表示される
- [ ] ネットワークエラー時に適切なメッセージが表示される
- [ ] オフライン時にService Workerが動作する

## 🚨 トラブルシューティング

### ケース1: ページが表示されない
**原因**: ビルドエラーまたはファイル配置ミス
**解決**:
```bash
# ビルドログを確認
npx expo export -p web --verbose

# distフォルダの内容を確認
ls -la dist/
```

### ケース2: PWAインストールできない
**原因**: manifest.jsonのパス問題
**解決**:
```bash
# manifest.jsonのパスを確認
cat dist/manifest.json | grep "src"

# パス修正
sed -i 's/"assets\/"/".\/"/g' dist/manifest.json
```

### ケース3: 認証が動作しない
**原因**: Firebase設定または環境変数の問題
**解決**:
```bash
# .envファイルの確認
cat .env

# Firebaseコンソールで設定値を確認
```

### ケース4: Service Workerが動作しない
**原因**: sw.jsのパスまたは登録エラー
**解決**:
```bash
# ブラウザコンソールでエラーを確認
# sw.jsのパスが正しいか確認
```

## 🔄 継続的デプロイ（オプション）

### GitHub Actions設定
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ main ]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm install
    - name: Build
      run: npx expo export -p web
      env:
        FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
        FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
        FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
        FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
        FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
        FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./dist
```

## 📋 デプロイ完了後のメンテナンス

### 定期確認項目
- [ ] Firebase Authenticationの利用状況
- [ ] エラーログの確認
- [ ] パフォーマンス監視
- [ ] セキュリティ設定の見直し

### 更新手順
```bash
# 1. コードを更新
# 2. ローカルテスト実施
# 3. デプロイスクリプト実行
./deploy.sh  # または .\deploy.ps1
# 4. 動作確認
```

## 🎯 成功の定義

✅ **デプロイ成功**: GitHub Pagesでアプリが表示される
✅ **認証成功**: 有明高専学生のみログイン可能
✅ **PWA成功**: スマートフォンにインストール可能
✅ **セキュリティ成功**: 不正アクセスがブロックされる
✅ **パフォーマンス成功**: ページ読み込みが3秒以内
