# An-Q - 有明高専 専用クイズアプリ

## 🎯 概要

有明工業高等専門学校の学生専用クイズ学習アプリ。PWA対応で、スマートフォンやPCにインストール可能。

## 🚀 機能

- **クイズ学習**: 多様なカテゴリのクイズ問題
- **学習履歴**: 学習進捗の記録と分析
- **音楽プレイヤー**: 学習用BGM機能
- **ミッション機能**: 学習モチベーション維持
- **テーマ切り替え**: ライト/ダークモード対応
- **多言語対応**: 日本語・英語対応

## 🔐 セキュリティ

- **アクセス制限**: 有明高専学生（@ga.ariake-nct.ac.jp）のみ
- **Firebase認証**: 安全なユーザー認証システム
- **管理者権限**: 管理者機能の分離

## 📱 PWA機能

- **オフライン対応**: Service Workerによるキャッシュ機能
- **ホーム画面追加**: スマートフォンにインストール可能
- **プッシュ通知**: 学習リマインダー機能

## 🛠️ 技術スタック

- **フレームワーク**: React Native + Expo
- **ルーティング**: Expo Router
- **認証**: Firebase Authentication
- **データベース**: Firestore
- **PWA**: Service Worker + Web App Manifest
- **デプロイ**: GitHub Pages

## 🚀 デプロイ

### ローカル開発

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .env にFirebase設定を記述

# 開発サーバー起動
npx expo start --web --clear
```

### GitHub Pagesデプロイ

```bash
# 自動デプロイ（GitHub Actions）
git push origin main

# 手動デプロイ
./deploy.sh  # Mac/Linux
.\deploy.ps1  # Windows
```

## 📁 プロジェクト構成

```
├── app/                    # Expo Routerの画面
│   ├── _layout.tsx         # ルートレイアウト
│   ├── index.tsx           # ホーム画面
│   ├── auth/               # 認証関連
│   └── [各画面].tsx        # 各機能画面
├── assets/                 # 画像・音声ファイル
├── .github/workflows/       # GitHub Actions
├── public/                # 静的ファイル
├── firebase-config.ts       # Firebase設定
├── manifest.json          # PWAマニフェスト
├── sw.js                 # Service Worker
└── package.json          # 依存関係
```

## 🔧 開発環境

- **Node.js**: 18+
- **npm**: 最新版
- **Expo CLI**: 最新版

## 📋 デプロイチェックリスト

- [ ] Firebaseプロジェクト作成済み
- [ ] 環境変数設定済み
- [ ] GitHubリポジトリ設定済み
- [ ] ローカルテスト完了
- [ ] GitHub Actions設定済み
- [ ] デプロイ完了
- [ ] 動作確認済み

## 🌐 アクセス

- **開発環境**: http://localhost:19006
- **本番環境**: https://[username].github.io/[repository]

## 📞 サポート

技術的な問題やご質問は、GitHubのIssue機能をご利用ください。

## 📄 ライセンス

このプロジェクトは有明工業高等専門学校の教育目的で作成されました。

---

**An-Q - 有明高専学生の学習をサポートするクイズアプリ** 🎓
