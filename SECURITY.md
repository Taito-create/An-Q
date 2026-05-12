# セキュリティとアクセス制限に関する設定

## 🔐 アクセス制限の概要

An-Qアプリは有明高専の学生専用アプリケーションとして設計されています。

### 認証システム
- **Firebase Authentication** を使用
- **メールドメイン制限**: `@ga.ariake-nct.ac.jp` のみ許可
- **管理者権限**: 特定の管理者アカウントのみ管理機能へアクセス

## 🛡️ 現在のセキュリティ設定

### 1. メールドメイン制限
```typescript
// app/auth/loginScreen.tsx
if (!email.includes('@ga.ariake-nct.ac.jp')) {
  Alert.alert('エラー', '有明高専のアカウント（@ga.ariake-nct.ac.jp）のみ使用できます');
  return;
}
```

### 2. 管理者権限制御
```typescript
// app/auth/authProvider.tsx
export const ADMIN_EMAIL = 'your-admin@ga.ariake-nct.ac.jp';
```

### 3. Firestoreセキュリティルール
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザーは自分のデータのみアクセス可能
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 管理者のみ全ユーザーデータにアクセス可能
    match /users/{userId} {
      allow read, write: if request.auth != null && 
        request.auth.token.email == 'your-admin@ga.ariake-nct.ac.jp';
    }
  }
}
```

## 🔧 セキュリティ強化のための追加設定

### 1. 環境変数の暗号化
```bash
# .env ファイルは .gitignore に含まれ、リポジトリに含まれない
# 本番環境では GitHub Secrets を使用
```

### 2. APIキーの保護
- Firebase APIキーは環境変数から読み込み
- ソースコードに直接記述しない

### 3. レート制限
- Firebase Authentication のレート制限を有効化
- 異常なログイン試行を検知

## 📋 セキュリティチェックリスト

- [x] メールドメイン制限の実装
- [x] 管理者権限の分離
- [x] 環境変数の設定
- [x] .gitignore での秘匿情報保護
- [ ] Firestoreセキュリティルールの設定
- [ ] レート制限の有効化
- [ ] ログイン試行の監視

## 🚨 注意事項

1. **管理者メールアドレス**: 実際の管理者アカウントに変更してください
2. **Firebase設定**: 本番環境用の正しい設定値を使用してください
3. **環境変数**: `.env` ファイルは絶対にGitコミットしないでください

## 📞 セキュリティインシデント報告

セキュリティに関する問題を発見した場合は、速やかに管理者に報告してください。
