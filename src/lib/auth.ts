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
const VERIFIED_EMAILS = [
  'francismichele90@gmail.com',
];

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(
      auth,
      googleProvider
    );

    const user = result.user;

    const userRef = doc(
      db,
      'users',
      user.uid
    );

    const userDoc = await getDoc(userRef);

    /*
     * FIRST GOOGLE LOGIN
     *
     * Create the Firestore profile once.
     * The Firebase UID is the permanent connection
     * between the Google account and this profile.
     */
    if (!userDoc.exists()) {
      const emailPrefix =
        user.email?.split('@')[0] ||
        'user';

      const defaultUsername =
        emailPrefix
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') ||
        `user${user.uid.slice(0, 6)}`;

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        username: defaultUsername,
        displayName: user.displayName,
        photoURL: user.photoURL,
        bio: '',
        verified:
          VERIFIED_EMAILS.includes(
            user.email || ''
          ),
        profileComplete: false,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        online: false,
      });
    } else {
      /*
       * EXISTING GOOGLE ACCOUNT
       *
       * Do NOT recreate or reset the username.
       * Do NOT set profileComplete to false.
       *
       * The existing Firestore profile belongs to
       * this Firebase UID and should be reused.
       */
      const existing =
        userDoc.data();

      const updates: Record<
        string,
        any
      > = {
        lastSeen:
          new Date().toISOString(),
      };

      /*
       * Keep the latest Google display name/photo
       * only when the stored profile does not already
       * have those values.
       *
       * The user's chosen username is NEVER overwritten.
       */
      if (
        !existing.displayName &&
        user.displayName
      ) {
        updates.displayName =
          user.displayName;
      }

      if (
        !existing.photoURL &&
        user.photoURL
      ) {
        updates.photoURL =
          user.photoURL;
      }

      if (!existing.email && user.email) {
        updates.email = user.email;
      }

      /*
       * Older profiles may have a username but
       * profileComplete was never set correctly.
       *
       * A saved username means the setup has already
       * been completed, so repair that state.
       */
      if (
        existing.username &&
        existing.profileComplete !== true
      ) {
        updates.profileComplete = true;
      }

      if (
        Object.keys(updates).length > 0
      ) {
        await setDoc(
          userRef,
          updates,
          { merge: true }
        );
      }
    }

    return user;
  } catch (error) {
    console.error(
      'Sign-in error:',
      error
    );

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
  const normalizedUsername =
    username
      .trim()
      .toLowerCase();

  const usersRef =
    collection(db, 'users');

  const q = query(
    usersRef,
    where(
      'username',
      '==',
      normalizedUsername
    )
  );

  const snapshot =
    await getDocs(q);

  if (snapshot.empty) {
    return true;
  }

  /*
   * The current user is allowed to keep
   * their existing username.
   */
  if (currentUserId) {
    const existingUser =
      snapshot.docs[0];

    if (
      existingUser.id ===
      currentUserId
    ) {
      return true;
    }
  }

  return false;
}