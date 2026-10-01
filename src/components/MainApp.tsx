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

/* ============================================================
   AVATAR HELPERS
============================================================ */

function getInitials(
  displayName?: string | null,
  username?: string | null
): string {
  const name =
    displayName?.trim() ||
    username?.trim() ||
    'User';

  const parts = name
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }

  return name
    .slice(0, 2)
    .toUpperCase();
}

function getAvatarBackground(
  value?: string | null
): string {
  const backgrounds = [
    'bg-purple-600',
    'bg-blue-600',
    'bg-indigo-600',
    'bg-pink-600',
    'bg-rose-600',
    'bg-teal-600',
    'bg-cyan-600',
    'bg-emerald-600',
  ];

  const text =
    value?.trim() || 'User';

  let hash = 0;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    hash =
      (hash * 31 +
        text.charCodeAt(i)) &
      0xffffffff;
  }

  return backgrounds[
    Math.abs(hash) %
      backgrounds.length
  ];
}

function Avatar({
  photoURL,
  displayName,
  username,
  className,
}: {
  photoURL?: string | null;
  displayName?: string | null;
  username?: string | null;
  className: string;
}) {
  const [imageFailed, setImageFailed] =
    useState(false);

  const initials = getInitials(
    displayName,
    username
  );

  const background =
    getAvatarBackground(
      displayName || username
    );

  if (
    photoURL &&
    !imageFailed
  ) {
    return (
      <img
        src={photoURL}
        alt={
          displayName ||
          username ||
          'User'
        }
        className={className}
        onError={() =>
          setImageFailed(true)
        }
      />
    );
  }

  return (
    <div
      className={`${className} ${background} text-white flex items-center justify-center font-semibold`}
      aria-label={
        displayName ||
        username ||
        'User'
      }
    >
      {initials}
    </div>
  );
}

/* ============================================================
   MAIN APP
============================================================ */

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

  /* ============================================================
     REDIRECT IF NOT LOGGED IN
  ============================================================ */

  useEffect(() => {
    if (!user && !loading) {
      router.push('/');
    }
  }, [
    user,
    loading,
    router,
  ]);

  /* ============================================================
     LOAD USER PROFILE
  ============================================================ */

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!user) {
        if (!cancelled) {
          setUserProfile(null);
          setProfileLoading(false);
        }

        return;
      }

      setProfileLoading(true);

      try {
        const profileRef =
          doc(
            db,
            'users',
            user.uid
          );

        const profileSnap =
          await getDoc(
            profileRef
          );

        if (
          profileSnap.exists()
        ) {
          const existing =
            profileSnap.data();

          const username =
            typeof existing.username ===
              'string' &&
            existing.username.trim()
              ? existing.username
              : null;

          const profileComplete =
            existing.profileComplete ===
              true ||
            Boolean(username);

          const normalizedProfile:
            UserProfile = {
            uid: user.uid,

            email:
              existing.email ??
              user.email,

            username,

            displayName:
              existing.displayName ??
              user.displayName,

            photoURL:
              existing.photoURL ??
              user.photoURL,

            bio:
              typeof existing.bio ===
              'string'
                ? existing.bio
                : '',

            verified:
              existing.verified ===
              true,

            profileComplete,

            createdAt:
              existing.createdAt ??
              null,

            lastSeen:
              existing.lastSeen ??
              null,

            online:
              existing.online ===
              true,
          };

          /*
           * Repair old profiles only when
           * something is actually missing/wrong.
           */
          if (
            existing.profileComplete !==
              profileComplete ||
            existing.uid !==
              user.uid
          ) {
            setDoc(
              profileRef,
              {
                uid: user.uid,
                profileComplete,
              },
              {
                merge: true,
              }
            ).catch((error) => {
              console.error(
                'Profile repair error:',
                error
              );
            });
          }

          if (!cancelled) {
            setUserProfile(
              normalizedProfile
            );
          }
        } else {
          const newProfile:
            UserProfile = {
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

            online:
              false,
          };

          if (!cancelled) {
            setUserProfile(
              newProfile
            );
          }

          /*
           * This happens only once when
           * the profile document does not exist.
           */
          setDoc(
            profileRef,
            newProfile
          ).catch((error) => {
            console.error(
              'Error creating user profile:',
              error
            );
          });
        }
      } catch (error) {
        console.error(
          'Error loading user profile:',
          error
        );

        if (!cancelled) {
          setUserProfile(null);
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /* ============================================================
     ONLINE / LAST SEEN

     IMPORTANT:
     No periodic heartbeat.

     Before:
       Firestore write every 60 seconds.

     Now:
       Write when status actually changes.

     This dramatically reduces Firestore writes.
  ============================================================ */

  useEffect(() => {
    if (
      !user ||
      !userProfile?.profileComplete
    ) {
      return;
    }

    const userRef =
      doc(
        db,
        'users',
        user.uid
      );

    let active = true;

    /*
     * Prevent duplicate writes when
     * multiple browser events happen
     * close together.
     */
    let currentOnlineState =
      userProfile.online === true;

    const markOnline = () => {
      if (!active) {
        return;
      }

      if (
        document.visibilityState !==
        'visible'
      ) {
        return;
      }

      /*
       * If we already know the user is
       * online, do not write again.
       */
      if (currentOnlineState) {
        return;
      }

      currentOnlineState = true;

      updateDoc(
        userRef,
        {
          online: true,
          lastSeen:
            serverTimestamp(),
        }
      ).catch((error) => {
        console.error(
          'Error updating online status:',
          error
        );

        /*
         * Allow another attempt if
         * the previous write failed.
         */
        currentOnlineState = false;
      });
    };

    const markOffline = () => {
      if (!active) {
        return;
      }

      /*
       * If we already know the user is
       * offline, do not write again.
       */
      if (!currentOnlineState) {
        return;
      }

      currentOnlineState = false;

      updateDoc(
        userRef,
        {
          online: false,
          lastSeen:
            serverTimestamp(),
        }
      ).catch((error) => {
        console.error(
          'Error updating offline status:',
          error
        );

        /*
         * Allow another attempt if
         * the previous write failed.
         */
        currentOnlineState = true;
      });
    };

    /*
     * Mark online when the app becomes
     * active for the first time.
     */
    if (
      document.visibilityState ===
      'visible'
    ) {
      /*
       * We intentionally force the
       * first active session to be
       * written as online.
       */
      currentOnlineState = false;
      markOnline();
    }

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

  /* ============================================================
     START CONVERSATION
  ============================================================ */

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

        const convoId = [
          user.uid,
          otherUser.uid,
        ]
          .sort()
          .join('_');

        const convoRef =
          doc(
            db,
            'conversations',
            convoId
          );

        const localConversation:
          Conversation = {
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

          unreadCounts: {
            [user.uid]: 0,
            [otherUser.uid]: 0,
          },

          lastMessage:
            null,

          updatedAt:
            null,
        };

        /*
         * Open immediately.
         */
        setSelectedConvo(
          localConversation
        );

        setSearchOpen(false);
        setShowRecents(false);

        /*
         * Firebase work happens in
         * the background.
         */
        try {
          const convoSnap =
            await getDoc(
              convoRef
            );

          if (
            convoSnap.exists()
          ) {
            setSelectedConvo({
              id: convoId,
              ...convoSnap.data(),
            } as Conversation);

            return;
          }

          const newConvo = {
            participants: [
              user.uid,
              otherUser.uid,
            ],

            participantData:
              localConversation
                .participantData,

            unreadCounts: {
              [user.uid]: 0,
              [otherUser.uid]: 0,
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
        } catch (error) {
          console.error(
            'Background conversation error:',
            error
          );
        }
      },
      [
        user,
        userProfile,
      ]
    );

  /* ============================================================
     OPEN EXISTING CONVERSATION
  ============================================================ */

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

  /* ============================================================
     RETURN TO RECENTS
  ============================================================ */

  function goBackToRecents() {
    setShowRecents(true);
  }

  /* ============================================================
     LOGOUT
  ============================================================ */

  async function handleLogout() {
    if (user) {
      /*
       * Only one offline write on logout.
       */
      updateDoc(
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
      ).catch((error) => {
        console.error(
          'Error marking user offline:',
          error
        );
      });
    }

    try {
      await logOut();
      router.push('/');
    } catch (error) {
      console.error(
        'Logout error:',
        error
      );
    }
  }

  /* ============================================================
     LOADING
  ============================================================ */

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

  /* ============================================================
     NOT LOGGED IN
  ============================================================ */

  if (!user) {
    return null;
  }

  /* ============================================================
     PROFILE COULD NOT LOAD
  ============================================================ */

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

  /* ============================================================
     PROFILE SETUP
  ============================================================ */

  if (
    !userProfile.profileComplete
  ) {
    return (
      <ProfileSetup
        user={userProfile}
        onComplete={(
          updatedProfile
        ) => {
          setUserProfile(
            updatedProfile
          );
        }}
      />
    );
  }

  /* ============================================================
     FIND OTHER USER
  ============================================================ */

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

  /* ============================================================
     MAIN APP
  ============================================================ */

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
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M19.43 12.98c.04-.32.07-.65.07-.98s.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.7 7.7 0 0 1-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.12.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
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
              <Avatar
                photoURL={
                  userProfile.photoURL
                }
                displayName={
                  userProfile.displayName
                }
                username={
                  userProfile.username
                }
                className="w-10 h-10 rounded-full object-cover border-2 border-white/50"
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

          {/* SETTINGS */}
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