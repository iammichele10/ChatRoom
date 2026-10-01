'use client';

import {
  useState,
  useEffect,
  useCallback,
} from 'react';

import { useAuthState } from 'react-firebase-hooks/auth';

import { auth, db } from '@/lib/firebase';

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { useRouter } from 'next/navigation';

import {
  UserProfile,
  Conversation,
} from '@/types';

import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import UserSearch from './UserSearch';
import ProfileSetup from './ProfileSetup';
import SettingsPanel from './SettingsPanel';

import { logOut } from '@/lib/auth';

export default function MainApp() {
  const [user, loading] =
    useAuthState(auth);

  const [userProfile, setUserProfile] =
    useState<UserProfile | null>(null);

  const [profileLoading, setProfileLoading] =
    useState(true);

  const [selectedConvo, setSelectedConvo] =
    useState<Conversation | null>(null);

  const [showRecents, setShowRecents] =
    useState(true);

  const [searchOpen, setSearchOpen] =
    useState(false);

  const [settingsOpen, setSettingsOpen] =
    useState(false);

  const router = useRouter();

  /*
   * REDIRECT IF NOT LOGGED IN
   */
  useEffect(() => {
    if (!user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  /*
   * LOAD USER PROFILE
   */
  useEffect(() => {
    async function loadProfile() {
      if (!user) {
        setProfileLoading(false);
        return;
      }

      try {
        const profileRef = doc(
          db,
          'users',
          user.uid
        );

        const profileSnap =
          await getDoc(profileRef);

        if (profileSnap.exists()) {
          setUserProfile(
            profileSnap.data() as UserProfile
          );
        } else {
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email,
            username: null,
            displayName: user.displayName,
            photoURL: user.photoURL,
            bio: '',
            verified: false,
            profileComplete: false,
            createdAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          };

          await setDoc(
            profileRef,
            newProfile
          );

          setUserProfile(
            newProfile
          );
        }
      } catch (error) {
        console.error(
          'Error loading user profile:',
          error
        );

        setUserProfile(null);
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [user]);

  /*
   * ONLINE / LAST SEEN SYSTEM
   */
  useEffect(() => {
    if (
      !user ||
      !userProfile?.profileComplete
    ) {
      return;
    }

    const userRef = doc(
      db,
      'users',
      user.uid
    );

    let active = true;

    const markOnline = async () => {
      if (!active) return;

      try {
        await updateDoc(
          userRef,
          {
            online: true,
            lastSeen:
              serverTimestamp(),
          }
        );
      } catch (error) {
        console.error(
          'Error updating online status:',
          error
        );
      }
    };

    const markOffline = async () => {
      if (!active) return;

      try {
        await updateDoc(
          userRef,
          {
            online: false,
            lastSeen:
              serverTimestamp(),
          }
        );
      } catch (error) {
        console.error(
          'Error updating offline status:',
          error
        );
      }
    };

    markOnline();

    const heartbeat =
      window.setInterval(
        () => {
          if (
            document.visibilityState ===
            'visible'
          ) {
            markOnline();
          }
        },
        15000
      );

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          markOnline();
        } else {
          markOffline();
        }
      };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    const handlePageHide = () => {
      markOffline();
    };

    window.addEventListener(
      'pagehide',
      handlePageHide
    );

    return () => {
      active = false;

      window.clearInterval(
        heartbeat
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );

      window.removeEventListener(
        'pagehide',
        handlePageHide
      );
    };
  }, [
    user,
    userProfile?.profileComplete,
  ]);

  /*
   * START CONVERSATION
   */
  const startConversation =
    useCallback(
      async (
        otherUser: UserProfile
      ) => {
        if (
          !user ||
          !userProfile
        ) {
          return;
        }

        try {
          const convoId = [
            user.uid,
            otherUser.uid,
          ]
            .sort()
            .join('_');

          const convoRef = doc(
            db,
            'conversations',
            convoId
          );

          const convoSnap =
            await getDoc(
              convoRef
            );

          if (!convoSnap.exists()) {
            const newConvo = {
              participants: [
                user.uid,
                otherUser.uid,
              ],

              participantData: {
                [user.uid]: {
                  username:
                    userProfile.username ||
                    '',
                  displayName:
                    userProfile.displayName ||
                    '',
                  photoURL:
                    userProfile.photoURL ||
                    '',
                  verified:
                    userProfile.verified ||
                    false,
                },

                [otherUser.uid]: {
                  username:
                    otherUser.username ||
                    '',
                  displayName:
                    otherUser.displayName ||
                    '',
                  photoURL:
                    otherUser.photoURL ||
                    '',
                  verified:
                    otherUser.verified ||
                    false,
                },
              },

              lastMessage: null,
              updatedAt:
                serverTimestamp(),
            };

            await setDoc(
              convoRef,
              newConvo
            );

            const localConversation: Conversation =
              {
                id: convoId,

                participants: [
                  user.uid,
                  otherUser.uid,
                ],

                participantData: {
                  [user.uid]: {
                    username:
                      userProfile.username ||
                      '',
                    displayName:
                      userProfile.displayName ||
                      '',
                    photoURL:
                      userProfile.photoURL ||
                      '',
                    verified:
                      userProfile.verified ||
                      false,
                  },

                  [otherUser.uid]: {
                    username:
                      otherUser.username ||
                      '',
                    displayName:
                      otherUser.displayName ||
                      '',
                    photoURL:
                      otherUser.photoURL ||
                      '',
                    verified:
                      otherUser.verified ||
                      false,
                  },
                },

                lastMessage: null,
                updatedAt: null,
              };

            setSelectedConvo(
              localConversation
            );
          } else {
            setSelectedConvo({
              id: convoId,
              ...convoSnap.data(),
            } as Conversation);
          }

          setSearchOpen(false);
          setShowRecents(false);
        } catch (error) {
          console.error(
            'Error starting conversation:',
            error
          );

          alert(
            'Unable to open this conversation. Please try again.'
          );
        }
      },
      [
        user,
        userProfile,
      ]
    );

  /*
   * OPEN EXISTING CONVERSATION
   */
  function openConversation(
    conversation: Conversation
  ) {
    if (
      !conversation ||
      !conversation.id ||
      !Array.isArray(
        conversation.participants
      )
    ) {
      console.error(
        'Invalid conversation:',
        conversation
      );

      return;
    }

    setSelectedConvo(
      conversation
    );

    setShowRecents(false);
    setSearchOpen(false);
  }

  /*
   * RETURN TO RECENTS
   */
  function goBackToRecents() {
    setShowRecents(true);
  }

  /*
   * LOGOUT
   */
  async function handleLogout() {
    try {
      if (user) {
        try {
          await updateDoc(
            doc(
              db,
              'users',
              user.uid
            ),
            {
              online: false,
              lastSeen:
                serverTimestamp(),
            }
          );
        } catch (error) {
          console.error(
            'Error marking user offline:',
            error
          );
        }
      }

      await logOut();

      router.push('/');
    } catch (error) {
      console.error(
        'Logout error:',
        error
      );
    }
  }

  /*
   * LOADING
   */
  if (
    loading ||
    profileLoading
  ) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />

          <span className="text-lg">
            Loading ChatLinked...
          </span>
        </div>
      </div>
    );
  }

  /*
   * NOT LOGGED IN
   */
  if (!user) {
    return null;
  }

  /*
   * PROFILE COULD NOT LOAD
   */
  if (!userProfile) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Unable to load your profile
          </h2>

          <p className="text-gray-500 mb-4">
            Please try refreshing the page.
          </p>

          <button
            type="button"
            onClick={() =>
              window.location.reload()
            }
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  /*
   * PROFILE SETUP
   */
  if (
    !userProfile.profileComplete
  ) {
    return (
      <ProfileSetup
        user={userProfile}
        onComplete={() =>
          window.location.reload()
        }
      />
    );
  }

  /*
   * FIND OTHER USER
   */
  const otherUserId =
    selectedConvo &&
    Array.isArray(
      selectedConvo.participants
    )
      ? selectedConvo.participants.find(
          (id) =>
            id !== user.uid
        )
      : null;

  const selectedOtherUser =
    selectedConvo &&
    otherUserId
      ? selectedConvo
          .participantData?.[
            otherUserId
          ]
      : null;

  /*
   * MAIN APP
   */
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-gray-100">
      <div className="flex h-full w-full">

        {/* SIDEBAR */}
        <aside
          className={`
            ${
              showRecents
                ? 'flex'
                : 'hidden'
            }

            md:flex
            w-full
            md:w-80
            lg:w-96
            h-full
            bg-white
            border-r
            border-gray-200
            flex-col
            flex-shrink-0
            relative
          `}
        >

          {/* SIDEBAR HEADER */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 text-white">

            <div className="flex items-center justify-between">

              <h1 className="text-xl font-bold">
                ChatLinked
              </h1>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-1">

                {/* SEARCH */}
                <button
                  type="button"
                  onClick={() =>
                    setSearchOpen(
                      (open) =>
                        !open
                    )
                  }
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/25 active:scale-95 transition-all duration-150"
                  title={
                    searchOpen
                      ? 'Close search'
                      : 'Search'
                  }
                  aria-label={
                    searchOpen
                      ? 'Close search'
                      : 'Search users'
                  }
                >
                  {searchOpen ? (
                    <svg
                      className="w-[19px] h-[19px]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M6 6l12 12" />
                      <path d="M18 6L6 18" />
                    </svg>
                  ) : (
                    <svg
                      className="w-[19px] h-[19px]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle
                        cx="11"
                        cy="11"
                        r="7"
                      />
                      <path d="M20 20l-4-4" />
                    </svg>
                  )}
                </button>

                {/* SETTINGS */}
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/25 active:scale-95 transition-all duration-150"
                  title="Settings"
                  aria-label="Open settings"
                >
                  <svg
                    className="w-[19px] h-[19px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                    />
                    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V20h-2.6v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H5v-2.6h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1L8 6.6l.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.5V5h2.6v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.5 1h.1v2.6h-.1a1.7 1.7 0 00-1.5 1z" />
                  </svg>
                </button>

                {/* LOGOUT */}
                <button
                  type="button"
                  onClick={
                    handleLogout
                  }
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/25 active:scale-95 transition-all duration-150"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <svg
                    className="w-[19px] h-[19px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 17l5-5-5-5" />
                    <path d="M15 12H3" />
                    <path d="M21 3v18" />
                  </svg>
                </button>

              </div>
            </div>

            {/* CURRENT USER */}
            <div className="flex items-center gap-3 mt-4">

              <img
                src={
                  userProfile.photoURL ||
                  '/default-avatar.png'
                }
                alt={
                  userProfile.displayName ||
                  'User'
                }
                className="w-10 h-10 rounded-full object-cover border-2 border-white/50"
                onError={(e) => {
                  e.currentTarget.src =
                    '/default-avatar.png';
                }}
              />

              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {userProfile.displayName}
                </div>

                <div className="text-sm text-white/80 truncate">
                  @{userProfile.username}
                </div>
              </div>
            </div>
          </div>

          {/* SEARCH */}
          <UserSearch
            onSelectUser={
              startConversation
            }
            excludeUids={[
              user.uid,
            ]}
            isOpen={
              searchOpen
            }
            onClose={() =>
              setSearchOpen(
                false
              )
            }
          />

          {/* RECENTS TITLE */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Recents
            </h2>
          </div>

          {/* CONVERSATION LIST */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ConversationList
              currentUserId={
                user.uid
              }
              onSelectConversation={
                openConversation
              }
              selectedId={
                selectedConvo?.id ||
                null
              }
            />
          </div>

          {/* SETTINGS PANEL */}
          {settingsOpen && (
            <SettingsPanel
              user={
                userProfile
              }
              onClose={() =>
                setSettingsOpen(
                  false
                )
              }
              onProfileUpdated={(
                updatedProfile
              ) => {
                setUserProfile(
                  updatedProfile
                );
              }}
            />
          )}
        </aside>

        {/* CHAT AREA */}
        <main
          className={`
            ${
              showRecents
                ? 'hidden'
                : 'flex'
            }

            md:flex
            flex-1
            min-w-0
            min-h-0
            h-full
            flex-col
          `}
        >
          {selectedConvo &&
          selectedOtherUser &&
          Array.isArray(
            selectedConvo.participants
          ) ? (
            <ChatWindow
              conversation={
                selectedConvo
              }
              otherUser={
                selectedOtherUser
              }
              currentUser={
                userProfile
              }
              onBack={
                goBackToRecents
              }
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 bg-gray-50">
              <div className="text-center max-w-sm mx-auto p-8">

                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg
                    className="w-10 h-10 text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Welcome to ChatLinked
                </h3>

                <p className="text-gray-500">
                  Search for users above to start a conversation
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}