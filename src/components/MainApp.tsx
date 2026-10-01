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
   * ============================================================
   * REDIRECT IF NOT LOGGED IN
   * ============================================================
   */
  useEffect(() => {
    if (!user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  /*
   * ============================================================
   * LOAD USER PROFILE
   * ============================================================
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

            email:
              user.email,

            username:
              null,

            displayName:
              user.displayName,

            photoURL:
              user.photoURL,

            bio:
              '',

            verified:
              false,

            profileComplete:
              false,

            createdAt:
              serverTimestamp(),

            lastSeen:
              serverTimestamp(),
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
   * ============================================================
   * ONLINE / LAST SEEN SYSTEM
   * ============================================================
   *
   * The user's Firestore document contains:
   *
   * online: true / false
   * lastSeen: timestamp
   *
   * While the page is visible, we refresh the online status
   * every 15 seconds.
   *
   * When the user leaves the page, switches tabs, or logs out,
   * we mark them offline and update lastSeen.
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

    /*
     * Mark online immediately.
     */
    markOnline();

    /*
     * Keep the user online while the page is visible.
     */
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

    /*
     * Detect tab visibility.
     */
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

    /*
     * Detect page closing/navigation.
     */
    const handlePageHide = () => {
      markOffline();
    };

    window.addEventListener(
      'pagehide',
      handlePageHide
    );

    /*
     * Cleanup.
     */
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
   * ============================================================
   * START CONVERSATION
   * ============================================================
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
          /*
           * Conversation ID is based on both user IDs.
           * Sorting guarantees the same ID regardless
           * of who starts the conversation.
           */
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

          /*
           * =====================================================
           * CREATE NEW CONVERSATION
           * =====================================================
           */
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

              lastMessage:
                null,

              updatedAt:
                serverTimestamp(),
            };

            await setDoc(
              convoRef,
              newConvo
            );

            /*
             * Create a local Conversation object
             * immediately so the chat can open without
             * waiting for another listener.
             */
            const localConversation: Conversation =
              {
                id:
                  convoId,

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

                lastMessage:
                  null,

                updatedAt:
                  null,
              };

            setSelectedConvo(
              localConversation
            );
          } else {
            /*
             * Existing conversation.
             */
            setSelectedConvo({
              id:
                convoId,

              ...convoSnap.data(),
            } as Conversation);
          }

          /*
           * Close search and switch to chat.
           */
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
   * ============================================================
   * OPEN EXISTING CONVERSATION
   * ============================================================
   */
  function openConversation(
    conversation: Conversation
  ) {
    /*
     * Safety check.
     *
     * This prevents an invalid conversation from
     * being passed into ChatWindow.
     */
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
   * ============================================================
   * RETURN TO RECENTS
   * ============================================================
   */
  function goBackToRecents() {
    setShowRecents(true);
  }

  /*
   * ============================================================
   * LOGOUT
   * ============================================================
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
   * ============================================================
   * LOADING
   * ============================================================
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
   * ============================================================
   * NOT LOGGED IN
   * ============================================================
   */
  if (!user) {
    return null;
  }

  /*
   * ============================================================
   * PROFILE COULD NOT LOAD
   * ============================================================
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
   * ============================================================
   * PROFILE SETUP
   * ============================================================
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
   * ============================================================
   * FIND OTHER USER IN SELECTED CONVERSATION
   * ============================================================
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

  /*
   * Get their stored conversation profile.
   */
  const selectedOtherUser =
    selectedConvo &&
    otherUserId
      ? selectedConvo
          .participantData?.[
            otherUserId
          ]
      : null;

  /*
   * ============================================================
   * MAIN APP
   * ============================================================
   */
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-gray-100">
      <div className="flex h-full w-full">

        {/* ====================================================
            SIDEBAR
        ===================================================== */}
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

          {/* ==================================================
              SIDEBAR HEADER
          ================================================== */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 text-white">

            <div className="flex items-center justify-between">

              <h1 className="text-xl font-bold">
                ChatLinked
              </h1>

              <div className="flex items-center gap-1">

                {/* Search */}
                <button
                  type="button"
                  onClick={() =>
                    setSearchOpen(
                      (open) =>
                        !open
                    )
                  }
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                  title="Search"
                  aria-label="Search users"
                >
                  {searchOpen ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 6l12 12M18 6L6 18"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  )}
                </button>

                {/* Settings */}
                <button
                  type="button"
                  onClick={() =>
                    setSettingsOpen(
                      true
                    )
                  }
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                  title="Settings"
                  aria-label="Settings"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 010 3.35 1.724 1.724 0 00-1.065 2.573c.94 1.543-.827 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.065c-1.543.94-3.31-.827-2.37-2.37a1.724 1.724 0 00-1.065-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.065-2.572c-.94-1.544.827-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>

                {/* Logout */}
                <button
                  type="button"
                  onClick={
                    handleLogout
                  }
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>

              </div>
            </div>

            {/* Current user */}
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

          {/* ==================================================
              SEARCH
          ================================================== */}
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

          {/* ==================================================
              RECENTS TITLE
          ================================================== */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">

            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Recents
            </h2>

          </div>

          {/* ==================================================
              CONVERSATION LIST
          ================================================== */}
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

          {/* ==================================================
              SETTINGS
          ================================================== */}
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

        {/* ====================================================
            CHAT AREA
        ===================================================== */}
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