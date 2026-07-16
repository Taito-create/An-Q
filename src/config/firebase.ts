import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { Platform } from "react-native";

// 正しい接続鍵です！
const firebaseConfig = {
  apiKey: "AIzaSyBr8S_zcf555B9LZWGLPayuFb8H6Og1MVI",
  authDomain: "an-q-77a3f.firebaseapp.com",
  projectId: "an-q-77a3f",
  storageBucket: "an-q-77a3f.firebasestorage.app",
  messagingSenderId: "211342470418",
  appId: "1:211342470418:web:684d0d7cb",
  measurementId: "G-03Y08B7NEY"
};

// 既に初期化されている場合は既存のアプリを使い、なければ初期化する
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let firebaseAuth: ReturnType<typeof getAuth>;

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

// Firestoreの二重初期化を防ぐ
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  // 既に初期化済みの場合は既存のインスタンスを取得
  db = getFirestore(app);
}

export { db };
