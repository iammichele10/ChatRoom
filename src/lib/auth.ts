import { signInWithPopup, signOut } from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

// VERIFIED ACCOUNTS
const VERIFIED_EMAILS = ['francismichele90@gmail.com'];

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      const emailPrefix = user.email?.split('@')[0] || 'user';

      const defaultUsername = emailPrefix
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        username: defaultUsername,
        displayName: user.displayName,
        photoURL: user.photoURL,
        bio: '',
        verified: VERIFIED_EMAILS.includes(user.email || ''),
        profileComplete: false,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    } else {
      await setDoc(
        userRef,
        {
          lastSeen: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return user;
  } catch (error) {
    console.error('Sign-in error:', error);
    throw error;
  }
}

export function logOut() {
  return signOut(auth);
}

export async function checkUsernameAvailable(
  username: string,
  currentUserId?: string
): Promise<boolean> {
  const normalizedUsername = username.trim().toLowerCase();

  const usersRef = collection(db, 'users');

  const q = query(
    usersRef,
    where('username', '==', normalizedUsername)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return true;
  }

  // If the username belongs to the current user,
  // it is still available for them to keep.
  if (currentUserId) {
    const existingUser = snapshot.docs[0];

    if (existingUser.id === currentUserId) {
      return true;
    }
  }

  return false;
}