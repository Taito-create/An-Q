# Firebase 認証システムセットアップ手順

## 1. Firebase プロジェクト作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 新規プロジェクト「An-Q」を作成
3. プロジェクト設定から Web アプリを追加

## 2. Firebase 設定

### Web アプリ設定
```javascript
// firebase-config.ts の内容を更新
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "an-q-app.firebaseapp.com",
  projectId: "an-q-app",
  storageBucket: "an-q-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "YOUR_APP_ID"
};
```

### Authentication 設定
1. Firebase Console → Authentication → Sign-in method
2. 「メール/パスワード」を有効化
3. 「メールアドレスの検証」を無効化（学校アカウントなので不要）

### Firestore 設定
1. Firebase Console → Firestore Database
2. データベースを作成（テストモードで開始）
3. セキュリティルールを設定：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Admin can read all user data
    match /users/{userId} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    // Activity logs - users can read their own, admin can read all
    match /userActivities/{activityId} {
      allow read: if request.auth != null && 
        (request.auth.uid == resource.data.userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
      allow write: if request.auth != null;
    }
  }
}
```

## 3. パッケージインストール

```bash
npm install firebase
```

## 4. 管理者アカウント設定

`firebase-config.ts` で管理者メールアドレスを設定：

```typescript
export const ADMIN_EMAIL = 'your-admin@ga.ariake-nct.ac.jp';
```

## 5. アプリのルート保護

既存の画面を認証で保護するには：

```typescript
// app/index.tsx などで
import AuthGuard from './auth/authGuard';

export default function HomeScreen() {
  return (
    <AuthGuard>
      {/* 既存のコンテンツ */}
    </AuthGuard>
  );
}
```

## 6. 管理者ダッシュボードへのアクセス

管理者アカウントでログイン後、以下のルートでアクセス：

```typescript
// app/admin.tsx
import AuthGuard from './auth/authGuard';
import AdminDashboard from './auth/adminDashboard';

export default function AdminPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminDashboard />
    </AuthGuard>
  );
}
```

## 7. ユーザー活動ログの記録

各コンポーネントで活動を記録：

```typescript
const { logUserActivity } = useAuth();

// クイズ完了時
await logUserActivity('quiz_completed', { 
  quizId: 'quiz123', 
  score: 85 
});

// 設定変更時
await logUserActivity('settings_changed', { 
  setting: 'language', 
  value: 'en' 
});
```

## 8. GitHub Pages デプロイ

1. Firebase Hosting を設定
2. ビルドコマンド：`expo build:web`
3. デプロイコマンド：`firebase deploy`

## セキュリティ考慮事項

- メールドメイン検証はクライアント側とサーバー側の両方で実装
- Firestore セキュリティルールでデータアクセスを制限
- 管理者権限は厳格に管理
- 定期的にバックアップを取得
