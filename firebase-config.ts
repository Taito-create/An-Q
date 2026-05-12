// Firebase Configuration - app.json の extra フィールドから読み込み
import Constants from 'expo-constants';

const firebaseConfigFromAppJson = Constants?.expoConfig?.extra?.firebase || {};

export const firebaseConfig = {
  apiKey: firebaseConfigFromAppJson.apiKey || "",
  authDomain: firebaseConfigFromAppJson.authDomain || "an-q-77a3f.firebaseapp.com",
  projectId: firebaseConfigFromAppJson.projectId || "an-q-77a3f",
  storageBucket: firebaseConfigFromAppJson.storageBucket || "an-q-77a3f.firebasestorage.app",
  messagingSenderId: firebaseConfigFromAppJson.messagingSenderId || "",
  appId: firebaseConfigFromAppJson.appId || ""
};

// Allowed email domains for Ariake National College of Technology
export const ALLOWED_DOMAINS = ['ga.ariake-nct.ac.jp'];

// Admin user email (your account)
export const ADMIN_EMAIL = Constants?.expoConfig?.extra?.adminEmail || 'your-admin@ga.ariake-nct.ac.jp';

// デバッグログ
console.log('🔧 Firebase Config Loaded:', {
  apiKey: firebaseConfig.apiKey?.substring(0, 15) + '...',
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain
});
