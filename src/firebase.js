import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBNA50q81m_GecSfik7PjvNN-rqY2ASoqI",
  authDomain: "healthcare-c1941.firebaseapp.com",
  projectId: "healthcare-c1941",
  storageBucket: "healthcare-c1941.firebasestorage.app",
  messagingSenderId: "769386665728",
  appId: "1:769386665728:web:e03f491ae6223e3b6705e5",
  measurementId: "G-MKWZ2N5SZZ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Backs the sendSosAlert callable in functions/index.js. Region must match
// the REGION constant there exactly — httpsCallable resolves the function's
// URL from this region, so a mismatch 404s with no useful error message.
export const functions = getFunctions(app, 'us-central1');
