import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const PLACEHOLDER_API_KEY = 'AIzaSyFakeKey-AstraCrowdAI12345'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

/** True when real Firebase web credentials were provided at build time. */
export function isFirebaseConfigured(): boolean {
  const key = firebaseConfig.apiKey
  return Boolean(key && key !== PLACEHOLDER_API_KEY && firebaseConfig.projectId)
}

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

if (isFirebaseConfigured()) {
  try {
    firebaseApp = initializeApp(firebaseConfig)
    firebaseAuth = getAuth(firebaseApp)
  } catch (e) {
    console.warn('[FIREBASE] Initialization failed:', e)
    firebaseApp = null
    firebaseAuth = null
  }
}

export { firebaseApp, firebaseAuth }
