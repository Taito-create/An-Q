# GitHub Pages デプロイ完全ガイド

## 📋 GitHub Pages公式ドキュメントの要約

### 🎯 基本的なデプロイフロー

1. **リポジトリ作成**
   - `<username>.github.io` または通常リポジトリ
   - Freeプランの場合はパブリックリポジトリ必須

2. **エントリファイル配置**
   - `index.html`、`index.md`、または `README.md`
   - 公開ソースの最上位階層に配置

3. **公開ソース設定**
   - Settings > Pages > Source
   - ブランチとフォルダーを指定
   - またはGitHub Actionsを使用

4. **自動デプロイ**
   - GitHub Actionsでビルド・デプロイ
   - プッシュ時に自動実行

---

## 🔧 An-Qアプリ用の追加設定

### 事前準備チェックリスト

#### ✅ Firebase設定
- [ ] Firebaseコンソールでプロジェクト作成
- [ ] Authentication > Sign-in method で「メール/パスワード」有効化
- [ ] Firestore Database 作成
- [ ] Webアプリ設定でAPIキー取得

#### ✅ 環境変数
- [ ] `.env.example` をコピーして `.env` 作成
- [ ] Firebase設定値を `.env` に記述
- [ ] GitHub Secretsに本番用設定を登録

#### ✅ GitHubリポジトリ
- [ ] リポジトリ作成済み
- [ ] Settings > Pages で「Deploy from a branch」選択
- [ ] Source: main / (root) 設定

#### ✅ ビルド設定
- [ ] Expo Webビルドが成功すること
- [ ] PWA機能が動作すること
- [ ] 認証機能が正常に動作すること

---

## 🚀 デプロイ方法

### 方法1: GitHub Actions自動デプロイ（推奨）

```yaml
# .github/workflows/deploy.yml で自動設定
# mainブランチにプッシュすると自動デプロイ
```

**設定手順:**
1. GitHub SecretsにFirebase設定を登録
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`

2. mainブランチにプッシュ
   ```bash
   git add .
   git commit -m "Deploy update"
   git push origin main
   ```

### 方法2: 手動デプロイ

**Windows:**
```powershell
.\deploy.ps1
```

**Mac/Linux:**
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🔍 デプロイ後の確認項目

### 基本動作
- [ ] https://[username].github.io/[repo]/ にアクセス可能
- [ ] トップページが正しく表示される
- [ ] PWAインストールプロンプトが表示される
- [ ] Service Workerが登録される

### 認証機能
- [ ] ログイン画面に遷移可能
- [ ] @ga.ariake-nct.ac.jp のみログイン可能
- [ ] 新規登録機能が動作
- [ ] 管理者権限が正しく分離

### エラーハンドリング
- [ ] 404ページが適切に表示
- [ ] ネットワークエラー時のメッセージ表示
- [ ] オフライン時のService Worker動作

---

## 🚨 トラブルシューティング

### ケース1: ページが表示されない
**原因**: ビルドエラーまたはファイル配置ミス
**解決**:
```bash
# ビルドログ確認
npx expo export -p web --verbose

# distフォルダ確認
ls -la dist/
```

### ケース2: PWAがインストールできない
**原因**: manifest.jsonのパス問題
**解決**:
```bash
# パス確認
cat dist/manifest.json | grep "src"

# 修正
sed -i 's/"assets\/"/".\/"/g' dist/manifest.json
```

### ケース3: 認証が動作しない
**原因**: Firebase設定または環境変数の問題
**解決**:
```bash
# 環境変数確認
cat .env

# GitHub Secrets確認
# GitHubリポジトリ > Settings > Secrets
```

### ケース4: GitHub Actionsが失敗
**原因**: ワークフローエラー
**解決**:
```bash
# Actionsタブでログ確認
# エラーメッセージを特定して修正
```

---

## 📊 パフォーマンス最適化

### ビルド最適化
```javascript
// app.json に追加
"web": {
  "bundler": "metro",
  "optimization": {
    "minify": true,
    "splitChunks": true
  }
}
```

### キャッシュ戦略
```javascript
// sw.js でキャッシュ最適化
const CACHE_NAME = 'anq-v2';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24時間
```

---

## 🔄 継続的改善

### 監視項目
- Core Web Vitalsスコア
- ページ読み込み速度
- エラーレート
- ユーザーアクティビティ

### 更新手順
1. コード更新
2. ローカルテスト
3. プッシュ（自動デプロイ）
4. 動作確認

---

## 🎯 成功の定義

✅ **技術的成功**: GitHub Pagesで正常に表示
✅ **機能的成功**: 全機能が本番で動作
✅ **セキュリティ成功**: アクセス制限が有効
✅ **パフォーマンス成功**: 3秒以内で読み込み完了
✅ **UX的成功**: PWAインストールとオフライン対応

---

## 📞 サポート

- **GitHub Issues**: 技術的な問題報告
- **ドキュメント**: `DEPLOYMENT.md` と `SECURITY.md`
- **ログ**: ブラウザコンソールとGitHub Actionsログ
