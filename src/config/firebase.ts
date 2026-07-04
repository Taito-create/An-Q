import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// あなたの正しい接続鍵です！
const firebaseConfig = {
  apiKey: "AIzaSyBr8S_zcf555B9LZWGLPayuFb8H6Og1MVI",
  authDomain: "an-q-77a3f.firebaseapp.com",
  projectId: "an-q-77a3f",
  storageBucket: "an-q-77a3f.firebasestorage.app",
  messagingSenderId: "211342470418",
  appId: "1:211342470418:web:7955a86694880684d0d7cb",
  measurementId: "G-03Y08B7NEY"
};

// 既に初期化されている場合は既存のアプリを使い、なければ初期化する
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Vite（Web環境）では、これだけで自動ログイン状態の保持が100%完璧に動作します！
export const auth = getAuth(app);