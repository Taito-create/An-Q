import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
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

if (Platform.OS === 'web') {
  // Vercel（Web）環境では、一切スマホ用ライブラリに触れずに初期化
  firebaseAuth = getAuth(app);
} else {
  try {
    // Vercelのビルド静的解析を完全に騙すため、文字列を組み立てて require します
    const moduleName = "@react-native-async-storage/async-storage";
    const AsyncStorage = require(moduleName).default;
    
    // getReactNativePersistence は動的にインポート
    const { getReactNativePersistence } = require("firebase/auth");
    
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    firebaseAuth = getAuth(app);
  }
}

export const auth = firebaseAuth;
export const db = getFirestore(app);

// Firestore オフライン永続性を有効化（Web環境のみ）
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not available in this browser');
    }
  });
}
