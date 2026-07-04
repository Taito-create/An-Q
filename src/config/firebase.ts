import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 画像1枚目に写っていた、あなたのアカウント専用の接続設定です！
const firebaseConfig = {
  apiKey: "AIzaSyBr8S_zcf555B9LZWGLPayuFb8H60g1MVI",
  authDomain: "an-q-77a3f.firebaseapp.com",
  projectId: "an-q-77a3f",
  storageBucket: "an-q-77a3f.firebasestorage.app",
  messagingSenderId: "211342470418",
  appId: "1:211342470418:web:e537e468e79a4355d0d7cb",
  measurementId: "G-XVJ780301M"
};

// Firebaseのアプリを初期化
const app = initializeApp(firebaseConfig);

// Web向けにAuth（認証）を初期化（デフォルトでIndexedDB/ローカルストレージを使用）
export const auth = getAuth(app);
