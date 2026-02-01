// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // optional: if you're using authentication
import { getFirestore } from "firebase/firestore"; // optional: if you're using Firestore
import { getStorage } from "firebase/storage"; // optional: if you're using Storage

export const firebaseConfig = {
  apiKey: "AIzaSyAuASMzcTEJazXRrZFeeU8oxTBRMk2GyyA",
  authDomain: "pay2x-4748c.firebaseapp.com",
  projectId: "pay2x-4748c",
  storageBucket: "pay2x-4748c.firebasestorage.app",
  messagingSenderId: "82465489496",
  appId: "1:82465489496:web:d73b89f2421d197c19802d"
};
 export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);       // optional
export const db = getFirestore(app);    // optional
export const storage = getStorage(app); // optional
