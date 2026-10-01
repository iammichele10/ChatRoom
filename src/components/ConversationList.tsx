'use client';

import { useState, useEffect } from 'react';
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
import { Conversation, UserProfile } from '@/types';
import VerifiedBadge from './VerifiedBadge';

interface ConversationListProps {
  currentUserId: string;
  onSelectConversation: (conversation: Conversation) => void;
  selectedId: string | null;
}

export default function ConversationList({
  currentUserId,
  onSelectConversation,
  selectedId,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<
    Record<string, UserProfile>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) {
      setConversations([]);
      setProfiles({});
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'conversations'),
      where(
        'participants',
        'array-contains',
        currentUserId
      ),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const convos = snapshot.docs.map(
          (conversationDoc) => ({
            id: conversationDoc.id,
            ...conversationDoc.data(),
          })
        ) as Conversation[];

        /*
         * Newest conversation first.
         */
        convos.sort((a, b) => {
          const getTime = (timestamp: any) => {
            if (!timestamp) return 0;

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

              if (timestamp instanceof Date) {
                return timestamp.getTime();
              }

              if (typeof timestamp === 'number') {
                return timestamp;
              }

              return (
                new Date(timestamp).getTime() ||
                0
              );
            } catch {
              return 0;
            }
          };

          return (
            getTime(
              b.lastMessage?.timestamp ||
                b.updatedAt
            ) -
            getTime(
              a.lastMessage?.timestamp ||
                a.updatedAt
            )
          );
        });

        setConversations(convos);

        /*
         * Get the CURRENT profile of every person
         * in the conversations.
         *
         * This means verification, name, photo,
         * username, etc. don't depend on old
         * participantData stored in the conversation.
         */
        const otherIds = Array.from(
          new Set(
            convos
              .map((conversation) =>
                conversation.participants?.find(
                  (id) =>
                    id !== currentUserId
                )
              )
              .filter(
                (id): id is string =>
                  Boolean(id)
              )
          )
        );

        const profileResults: Record<
          string,
          UserProfile
        > = {};

        await Promise.all(
          otherIds.map(async (uid) => {
            try {
              const userSnapshot =
                await getDoc(
                  doc(db, 'users', uid)
                );

              if (userSnapshot.exists()) {
                profileResults[uid] =
                  userSnapshot.data() as UserProfile;
              }
            } catch (error) {
              console.error(
                `Failed to load profile ${uid}:`,
                error
              );
            }
          })
        );

        setProfiles(profileResults);
        setLoading(false);
      },
      (error) => {
        console.error(
          'Conversation list error:',
          error
        );

        setConversations([]);
        setProfiles({});
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUserId]);

  function getOtherParticipant(
    conversation: Conversation
  ) {
    const otherId =
      conversation.participants?.find(
        (id) => id !== currentUserId
      );

    if (!otherId) {
      return null;
    }

    /*
     * Prefer the LIVE user profile.
     */
    const liveProfile = profiles[otherId];

    if (liveProfile) {
      return {
        uid: otherId,
        username:
          liveProfile.username || '',
        displayName:
          liveProfile.displayName || 'User',
        photoURL:
          liveProfile.photoURL || '',
        verified:
          liveProfile.verified === true,
      };
    }

    /*
     * Fallback to conversation data while
     * the live profile is loading.
     */
    return (
      conversation.participantData?.[otherId] ||
      null
    );
  }

  function formatTime(timestamp: any): string {
    if (!timestamp) return '';

    try {
      const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      const now = new Date();

      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      const startOfDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );

      const days = Math.floor(
        (startOfToday.getTime() -
          startOfDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (days === 0) {
        return date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      if (days === 1) {
        return 'Yesterday';
      }

      if (days < 7) {
        return date.toLocaleDateString([], {
          weekday: 'short',
        });
      }

      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 animate-pulse"
          >
            <div className="w-12 h-12 bg-gray-200 rounded-full" />

            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg
          className="w-12 h-12 mx-auto mb-3 text-gray-300"
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

        <p className="text-sm">
          No conversations yet
        </p>

        <p className="text-xs text-gray-400 mt-1">
          Search for users to start chatting
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {conversations.map((convo) => {
        const other =
          getOtherParticipant(convo);

        if (!other) return null;

        const latestTimestamp =
          convo.lastMessage?.timestamp ||
          convo.updatedAt;

        const preview = convo.lastMessage
          ? convo.lastMessage.senderId ===
            currentUserId
            ? `You: ${convo.lastMessage.text}`
            : convo.lastMessage.text
          : 'Start chatting';

        return (
          <button
            key={convo.id}
            type="button"
            onClick={() =>
              onSelectConversation(convo)
            }
            className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors ${
              selectedId === convo.id
                ? 'bg-purple-50 border-r-4 border-purple-600'
                : ''
            }`}
          >
            {/* Profile photo */}
            <div className="flex-shrink-0">
              <img
                src={
                  other.photoURL ||
                  '/default-avatar.png'
                }
                alt={
                  other.displayName ||
                  'User'
                }
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.src =
                    '/default-avatar.png';
                }}
              />
            </div>

            {/* Conversation information */}
            <div className="flex-1 min-w-0 text-left">
              {/* Name + time */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-semibold text-gray-900 truncate">
                    {other.displayName ||
                      'User'}
                  </span>

                  {other.verified === true && (
                    <VerifiedBadge />
                  )}
                </div>

                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatTime(
                    latestTimestamp
                  )}
                </span>
              </div>

              {/* Last message */}
              <div className="mt-1">
                <p className="text-sm text-gray-500 truncate">
                  {preview}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}