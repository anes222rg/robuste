/**
 * Firebase configuration and initialization.
 * WARNING: These credentials are client-side exposed by design.
 * Firebase Security Rules must be used to protect data.
 * TODO: For production, move sensitive operations to a backend/cloud function.
 * TODO: Implement Firebase Security Rules for orders collection.
 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBTrnKCYOtfSSDYtmVQbzP2HcwgkLT565Y',
  authDomain: 'robuste-c8e0f.firebaseapp.com',
  projectId: 'robuste-c8e0f',
  storageBucket: 'robuste-c8e0f.appspot.com',
  messagingSenderId: '975609984963',
  appId: '1:975609984963:web:a481efb493a88d7bc7af76',
  measurementId: 'G-DWT7MZN028'
};

let firestoreDB = null;

function initFirebase() {
  if (typeof firebase === 'undefined' || !firebase.initializeApp) {
    console.warn('Firebase SDK not loaded');
    return null;
  }
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    firestoreDB = firebase.firestore();
    return firestoreDB;
  } catch (e) {
    console.error('Firebase init error:', e);
    return null;
  }
}

function getFirestoreDB() {
  return firestoreDB;
}

/**
 * Security note: Firebase config is exposed client-side.
 * This is by design for Firebase web apps.
 * All security must be enforced through Firebase Security Rules.
 * 
 * TODO Future: For admin dashboard, implement Firebase Authentication
 * with custom claims for role-based access control.
 * 
 * TODO Future: For multi-store SaaS, use separate Firestore collections
 * per store or a store_id field for data isolation.
 */
