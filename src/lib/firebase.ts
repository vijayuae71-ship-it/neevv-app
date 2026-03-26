import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBwq7uTfP7P4eEF9kZ-03IpMTb4P_HetfM",
  authDomain: "neev-491312.firebaseapp.com",
  projectId: "neev-491312",
  storageBucket: "neev-491312.firebasestorage.app",
  messagingSenderId: "196024286149",
  appId: "1:196024286149:web:2dc89e65b063997cca29ac",
  measurementId: "G-E8FLZYV3NF",
};

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
