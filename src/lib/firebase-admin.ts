import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let _app: App | undefined;
let _db: Firestore | undefined;
let _auth: Auth | undefined;
let _initFailed = false;

function getApp(): App {
  if (_initFailed) throw new Error('Firebase Admin init previously failed');
  if (!_app) {
    if (getApps().length === 0) {
      try {
        // On Cloud Run, use Application Default Credentials (ADC)
        // — no env vars needed, the service account is automatic.
        // Only use explicit cert() if all env vars are present (local dev).
        const projectId = process.env.GCP_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

        if (projectId && clientEmail && privateKey) {
          _app = initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            }),
          });
        } else {
          // ADC — works on Cloud Run, Cloud Build, GCE, etc.
          _app = initializeApp({
            credential: applicationDefault(),
          });
        }
      } catch (err) {
        console.error('Firebase Admin init failed:', err);
        _initFailed = true;
        throw err;
      }
    } else {
      _app = getApps()[0];
    }
  }
  return _app;
}

export function getAdminDb(): Firestore {
  if (!_db) {
    getApp();
    _db = getFirestore();
  }
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) {
    getApp();
    _auth = getAuth();
  }
  return _auth;
}
