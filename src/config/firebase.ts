import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { Platform } from "react-native";

// 正しい接続鍵です！
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

let firebaseAuth;

// Vercel（Web）環境と、スマホ（iOS/Android）環境で処理をクッキリ分ける
if (Platform.OS === 'web') {
  // Web環境では通常のgetAuthを使用。Firebaseがブラウザ用の保存領域（LocalStorage）を自動で使ってくれます。
  firebaseAuth = getAuth(app);
} else {
  // スマホ環境のときだけ、エラーの原因になるAsyncStorageを「その場」で安全に読み込む（動的インポート）
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  try {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    firebaseAuth = getAuth(app);
  }
}

export const auth = firebaseAuth;