
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import { auth } from "../firebase";

// Google provider
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});

// Register with email and password
export async function registerWithEmail(
  email: string,
  password: string
) {
  const result = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  await sendEmailVerification(result.user);

  return result.user;
}

// Login with email and password
export async function loginWithEmail(
  email: string,
  password: string
) {
  const result = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return result.user;
}

// Login with Google
export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);

  return result.user;
}

// Send password reset email
export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

// Resend email verification
export async function resendVerification(user: User) {
  await sendEmailVerification(user);
}

// Logout
export async function logout() {
  await signOut(auth);
}

// Listen for login state changes
export function listenToAuthChanges(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, callback);
}
