import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 新しく取得した、完全に正しい接続鍵です！
const firebaseConfig = {
  apiKey: "AIzaSyBr8S_zcf555B9LZWGLPayuFb8H6Og1MVI",
  authDomain: "an-q-77a3f.firebaseapp.com",
  projectId: "an-q-77a3f",
  storageBucket: "an-q-77a3f.firebasestorage.app",
  messagingSenderId: "211342470418",
  appId: "1:211342470418:web:7955a86694880684d0d7cb",
  measurementId: "G-03Y08B7NEY"
};

// 既に初期化されている場合は既存のアプリを使い、なければ初期化する（重複エラー防止）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// React Native（Vercel/Web両対応）で安全にログイン状態を保持する設定
let firebaseAuth;
try {
  firebaseAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  // すでに初期化済みの場合は既存のAuthインスタンスを取得
  firebaseAuth = getAuth(app);
}

export const auth = firebaseAuth;