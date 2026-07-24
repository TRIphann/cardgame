// Firebase web SDK config — used by any direct Firestore listeners the frontend
// may opt into. The primary path goes through the .NET backend so we do not
// expose these credentials to write operations.
export const firebaseConfig = {
  apiKey: "AIzaSyCAbRIO7rknqQc_yQ_B3GXSwMpwldxgWtQ",
  authDomain: "cardgame-594f0.firebaseapp.com",
  projectId: "cardgame-594f0",
  storageBucket: "cardgame-594f0.firebasestorage.app",
  messagingSenderId: "30780766563",
  appId: "1:30780766563:web:9e14ba69783a0cee6bfb56",
  measurementId: "G-6Q02ZYR1E2",
};

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
