// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBr8S_zcf555B9LZWGLPayuFb8H6Og1MVI",
  authDomain: "an-q-77a3f.firebaseapp.com",
  projectId: "an-q-77a3f",
  storageBucket: "an-q-77a3f.firebasestorage.app",
  messagingSenderId: "211342470418",
  appId: "1:211342470418:web:7955a86694880684d0d7cb",
  measurementId: "G-03Y08B7NEY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);