import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
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

/**
 * Ensure user is authenticated — sign in anonymously if no user.
 * Returns the current Firebase User (anonymous or Google-signed-in).
 * Call this before any Firestore or API operation.
 */
let authReady: Promise<User | null> | null = null;

export function ensureAuth(): Promise<User | null> {
  if (authReady) return authReady;
  
  authReady = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        // Already signed in (Google or anonymous)
        resolve(user);
      } else {
        // No user — sign in anonymously
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (error) {
          console.warn('Anonymous sign-in failed:', error);
          resolve(null);
        }
      }
    });
  });
  
  return authReady;
}

export default app;
