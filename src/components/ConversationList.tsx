'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
  doc,
  getDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import {
  Conversation,
} from '@/types';

import VerifiedBadge from './VerifiedBadge';

interface ConversationListProps {
  currentUserId: string;
  onSelectConversation: (
    conversation: Conversation
  ) => void;
  selectedId: string | null;
}

interface ProfileData {
  username: string;
  displayName: string;
  photoURL: string;
  verified: boolean;
}

/* ============================================================
   AVATAR HELPERS
============================================================ */

function getInitials(
  name?: string | null,
  username?: string | null
): string {
  const value =
    name?.trim() ||
    username?.trim() ||
    'U';

  const parts = value
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }

  return value
    .slice(0, 2)
    .toUpperCase();
}

function getAvatarBackground(
  value?: string | null
): string {
  const colors = [
    'bg-purple-600',
    'bg-blue-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-fuchsia-600',
    'bg-cyan-600',
  ];

  const text =
    value || 'user';

  let total = 0;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    total =
      text.charCodeAt(i) +
      ((total << 5) - total);
  }

  return colors[
    Math.abs(total) % colors.length
  ];
}

function Avatar({
  photoURL,
  name,
  username,
  className,
}: {
  photoURL?: string | null;
  name?: string | null;
  username?: string | null;
  className: string;
}) {
  const [imageFailed, setImageFailed] =
    useState(false);

  const initials = getInitials(
    name,
    username
  );

  const background =
    getAvatarBackground(
      name || username
    );

  if (
    photoURL &&
    !imageFailed
  ) {
    return (
      <img
        src={photoURL}
        alt={
          name ||
          username ||
          'Profile'
        }
        className={`${className} object-cover`}
        onError={() =>
          setImageFailed(true)
        }
      />
    );
  }

  return (
    <div
      className={`${className} ${background} text-white flex items-center justify-center font-semibold select-none`}
      aria-label={
        name ||
        username ||
        'Profile'
      }
    >
      {initials}
    </div>
  );
}

/* ============================================================
   TIME
============================================================ */

function formatConversationTime(
  timestamp: any
): string {
  if (!timestamp) {
    return '';
  }

  try {
    const date =
      typeof timestamp.toDate ===
      'function'
        ? timestamp.toDate()
        : timestamp instanceof Date
        ? timestamp
        : new Date(timestamp);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '';
    }

    const now =
      new Date();

    const sameDay =
      date.toDateString() ===
      now.toDateString();

    if (sameDay) {
      return date.toLocaleTimeString(
        [],
        {
          hour: 'numeric',
          minute: '2-digit',
        }
      );
    }

    return date.toLocaleDateString(
      [],
      {
        month: 'short',
        day: 'numeric',
      }
    );
  } catch {
    return '';
  }
}

/* ============================================================
   CONVERSATION LIST
============================================================ */

export default function ConversationList({
  currentUserId,
  onSelectConversation,
  selectedId,
}: ConversationListProps) {
  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [profiles, setProfiles] =
    useState<
      Record<string, ProfileData>
    >({});

  const [loading, setLoading] =
    useState(true);

  /*
   * This cache survives Firestore snapshots
   * while this component remains mounted.
   *
   * A profile is read only once unless it has
   * never been cached.
   */
  const profileCache =
    useRef(
      new Map<string, ProfileData>()
    );

  const loadingProfiles =
    useRef(
      new Set<string>()
    );

  /* ============================================================
     REALTIME CONVERSATIONS
  ============================================================ */

  useEffect(() => {
    if (!currentUserId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const conversationsQuery =
      query(
        collection(
          db,
          'conversations'
        ),
        where(
          'participants',
          'array-contains',
          currentUserId
        ),
        limit(50)
      );

    const unsubscribe =
      onSnapshot(
        conversationsQuery,
        (snapshot) => {
          const loaded =
            snapshot.docs.map(
              (conversationDoc) => {
                const data =
                  conversationDoc.data();

                return {
                  id:
                    conversationDoc.id,
                  ...data,
                } as Conversation;
              }
            );

          loaded.sort(
            (a, b) => {
              const aTime =
                getTimestampMs(
                  a.lastMessage
                    ?.timestamp ||
                    a.updatedAt
                );

              const bTime =
                getTimestampMs(
                  b.lastMessage
                    ?.timestamp ||
                    b.updatedAt
                );

              return (
                bTime - aTime
              );
            }
          );

          setConversations(
            loaded
          );

          setLoading(false);

          /*
           * Find participants whose profile
           * we have never loaded.
           */
          const missingIds =
            new Set<string>();

          loaded.forEach(
            (conversation) => {
              const otherId =
                conversation.participants.find(
                  (id) =>
                    id !==
                    currentUserId
                );

              if (
                !otherId ||
                profileCache.current.has(
                  otherId
                ) ||
                loadingProfiles.current.has(
                  otherId
                )
              ) {
                return;
              }

              missingIds.add(
                otherId
              );
            }
          );

          /*
           * Fetch each missing profile only once.
           */
          missingIds.forEach(
            (uid) => {
              loadProfile(uid);
            }
          );
        },
        (error) => {
          console.error(
            'Conversation listener error:',
            error
          );

          setLoading(false);
        }
      );

    return unsubscribe;
  }, [currentUserId]);

  /* ============================================================
     LOAD ONE PROFILE
  ============================================================ */

  async function loadProfile(
    uid: string
  ) {
    if (
      profileCache.current.has(
        uid
      ) ||
      loadingProfiles.current.has(
        uid
      )
    ) {
      return;
    }

    loadingProfiles.current.add(
      uid
    );

    try {
      const snapshot =
        await getDoc(
          doc(
            db,
            'users',
            uid
          )
        );

      if (
        !snapshot.exists()
      ) {
        return;
      }

      const data =
        snapshot.data();

      const profile: ProfileData = {
        username:
          typeof data.username ===
          'string'
            ? data.username
            : '',

        displayName:
          typeof data.displayName ===
          'string'
            ? data.displayName
            : 'User',

        photoURL:
          typeof data.photoURL ===
          'string'
            ? data.photoURL
            : '',

        verified:
          data.verified === true,
      };

      profileCache.current.set(
        uid,
        profile
      );

      setProfiles(
        (previous) => ({
          ...previous,
          [uid]: profile,
        })
      );
    } catch (error) {
      console.error(
        'Error loading conversation profile:',
        error
      );
    } finally {
      loadingProfiles.current.delete(
        uid
      );
    }
  }

  /* ============================================================
     TIMESTAMP
  ============================================================ */

  function getTimestampMs(
    timestamp: any
  ): number {
    if (!timestamp) {
      return 0;
    }

    try {
      if (
        typeof timestamp.toMillis ===
        'function'
      ) {
        return timestamp.toMillis();
      }

      if (
        typeof timestamp.toDate ===
        'function'
      ) {
        return timestamp
          .toDate()
          .getTime();
      }

      if (
        timestamp instanceof Date
      ) {
        return timestamp.getTime();
      }

      const date =
        new Date(timestamp);

      return Number.isNaN(
        date.getTime()
      )
        ? 0
        : date.getTime();
    } catch {
      return 0;
    }
  }

  /* ============================================================
     OTHER PARTICIPANT
  ============================================================ */

  function getOtherParticipant(
    conversation: Conversation
  ) {
    const otherId =
      conversation.participants.find(
        (id) =>
          id !== currentUserId
      );

    if (!otherId) {
      return {
        id: '',
        username: '',
        displayName: 'User',
        photoURL: '',
        verified: false,
      };
    }

    /*
     * Prefer cached live profile.
     */
    const cached =
      profiles[otherId] ||
      profileCache.current.get(
        otherId
      );

    if (cached) {
      return {
        id: otherId,
        ...cached,
      };
    }

    /*
     * Fall back to conversation participantData.
     *
     * This means the conversation can render
     * immediately without waiting for a profile read.
     */
    const participant =
      conversation
        .participantData?.[
        otherId
      ];

    return {
      id: otherId,

      username:
        participant?.username ||
        '',

      displayName:
        participant?.displayName ||
        'User',

      photoURL:
        participant?.photoURL ||
        '',

      verified:
        participant?.verified ===
        true,
    };
  }

  /* ============================================================
     LOADING
  ============================================================ */

  if (
    loading &&
    conversations.length === 0
  ) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ============================================================
     EMPTY
  ============================================================ */

  if (
    !loading &&
    conversations.length === 0
  ) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-7 h-7 text-purple-500"
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

          <p className="text-sm text-gray-500">
            No conversations yet.
          </p>

          <p className="text-xs text-gray-400 mt-1">
            Search for someone to start chatting.
          </p>
        </div>
      </div>
    );
  }

  /* ============================================================
     LIST
  ============================================================ */

  return (
    <div className="h-full overflow-y-auto">
      {conversations.map(
        (conversation) => {
          const other =
            getOtherParticipant(
              conversation
            );

          const unread =
            conversation
              .unreadCounts?.[
              currentUserId
            ] || 0;

          const isSelected =
            selectedId ===
            conversation.id;

          const lastMessage =
            conversation.lastMessage;

          return (
            <button
              key={
                conversation.id
              }
              type="button"
              onClick={() =>
                onSelectConversation(
                  conversation
                )
              }
              className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                isSelected
                  ? 'bg-purple-50'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="relative flex-shrink-0">
                <Avatar
                  photoURL={
                    other.photoURL
                  }
                  name={
                    other.displayName
                  }
                  username={
                    other.username
                  }
                  className="w-12 h-12 rounded-full"
                />

                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                    {unread > 99
                      ? '99+'
                      : unread}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {other.displayName ||
                        'User'}
                    </h3>

                    {other.verified && (
                      <VerifiedBadge />
                    )}
                  </div>

                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {formatConversationTime(
                      lastMessage
                        ?.timestamp ||
                        conversation.updatedAt
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    className={`text-xs truncate ${
                      unread > 0
                        ? 'text-gray-800 font-medium'
                        : 'text-gray-500'
                    }`}
                  >
                    {lastMessage?.text ||
                      'Start a conversation'}
                  </p>
                </div>

                {other.username && (
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">
                    @{other.username}
                  </p>
                )}
              </div>
            </button>
          );
        }
      )}
    </div>
  );
}