'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { createPortal } from 'react-dom';

import {
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  increment,
  getDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import {
  Conversation,
  Message,
  UserProfile,
} from '@/types';

import VerifiedBadge from './VerifiedBadge';

interface ChatWindowProps {
  conversation: Conversation;
  otherUser: {
    username: string;
    displayName: string;
    photoURL: string;
    verified: boolean;
  };
  currentUser: UserProfile;
  onBack?: () => void;
}

interface OtherProfile {
  username: string;
  displayName: string;
  photoURL: string;
  verified: boolean;
  bio: string;
}

/* ============================================================
   FALLBACK AVATAR
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

  const text = value || 'user';

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
   MAIN CHAT WINDOW
============================================================ */

export default function ChatWindow({
  conversation,
  otherUser,
  currentUser,
  onBack,
}: ChatWindowProps) {
  const [messages, setMessages] =
    useState<Message[]>([]);

  const [newMessage, setNewMessage] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const [otherLastSeen, setOtherLastSeen] =
    useState<any>(null);

  const [otherOnline, setOtherOnline] =
    useState(false);

  const [showProfile, setShowProfile] =
    useState(false);

  const [mounted, setMounted] =
    useState(false);

  const [otherProfile, setOtherProfile] =
    useState<OtherProfile>({
      username:
        otherUser?.username || '',
      displayName:
        otherUser?.displayName ||
        'User',
      photoURL:
        otherUser?.photoURL || '',
      verified:
        otherUser?.verified === true,
      bio: '',
    });

  const pendingMessages =
    useRef(
      new Map<string, Message>()
    );

  /*
   * Prevents repeated unread-clear writes
   * while this chat remains open.
   */
  const unreadClearedForConversation =
    useRef<string | null>(null);

  const otherId =
    conversation.participants.find(
      (id) =>
        id !== currentUser.uid
    ) || '';

  /* ============================================================
     PORTAL
  ============================================================ */

  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);
    };
  }, []);

  /* ============================================================
     SYNCHRONIZE OTHER USER FROM CONVERSATION
  ============================================================ */

  useEffect(() => {
    setOtherProfile(
      (previous) => ({
        username:
          otherUser?.username ||
          previous.username ||
          '',

        displayName:
          otherUser?.displayName ||
          previous.displayName ||
          'User',

        photoURL:
          otherUser?.photoURL ||
          previous.photoURL ||
          '',

        verified:
          otherUser?.verified ??
          previous.verified ??
          false,

        bio:
          previous.bio || '',
      })
    );
  }, [
    otherUser?.username,
    otherUser?.displayName,
    otherUser?.photoURL,
    otherUser?.verified,
  ]);

  /* ============================================================
     LOAD OTHER USER PROFILE ONCE
============================================================ */

  useEffect(() => {
    if (!otherId) {
      return;
    }

    let cancelled = false;

    async function loadOtherProfile() {
      try {
        const snapshot =
          await getDoc(
            doc(
              db,
              'users',
              otherId
            )
          );

        if (
          cancelled ||
          !snapshot.exists()
        ) {
          return;
        }

        const data =
          snapshot.data();

        setOtherProfile(
          (previous) => ({
            username:
              typeof data.username ===
                'string' &&
              data.username.trim()
                ? data.username
                : previous.username,

            displayName:
              typeof data.displayName ===
                'string' &&
              data.displayName.trim()
                ? data.displayName
                : previous.displayName,

            photoURL:
              typeof data.photoURL ===
                'string' &&
              data.photoURL.trim()
                ? data.photoURL
                : previous.photoURL,

            verified:
              typeof data.verified ===
              'boolean'
                ? data.verified
                : previous.verified,

            bio:
              typeof data.bio ===
                'string'
                ? data.bio
                : previous.bio,
          })
        );

        setOtherLastSeen(
          data.lastSeen || null
        );

        setOtherOnline(
          data.online === true
        );
      } catch (error) {
        console.error(
          'Error loading other profile:',
          error
        );
      }
    }

    loadOtherProfile();

    return () => {
      cancelled = true;
    };
  }, [otherId]);

  /* ============================================================
     CLEAR UNREAD COUNT

     IMPORTANT:
     We only attempt this once for each
     conversation while it is open.

     This prevents repeated writes caused
     by component/listener activity.
  ============================================================ */

  useEffect(() => {
    if (
      !conversation.id ||
      !currentUser.uid
    ) {
      return;
    }

    if (
      unreadClearedForConversation.current ===
      conversation.id
    ) {
      return;
    }

    const currentUnread =
      conversation.unreadCounts?.[
        currentUser.uid
      ];

    /*
     * If there are already no unread messages,
     * there is absolutely nothing to write.
     */
    if (
      typeof currentUnread !==
        'number' ||
      currentUnread <= 0
    ) {
      unreadClearedForConversation.current =
        conversation.id;

      return;
    }

    unreadClearedForConversation.current =
      conversation.id;

    updateDoc(
      doc(
        db,
        'conversations',
        conversation.id
      ),
      {
        [`unreadCounts.${currentUser.uid}`]:
          0,
      }
    ).catch((error) => {
      console.error(
        'Failed to clear unread count:',
        error
      );

      /*
       * Allow retry if the write failed.
       */
      if (
        unreadClearedForConversation.current ===
        conversation.id
      ) {
        unreadClearedForConversation.current =
          null;
      }
    });
  }, [
    conversation.id,
    conversation.unreadCounts,
    currentUser.uid,
  ]);

  /* ============================================================
     MESSAGE LISTENER

     ONE REALTIME LISTENER FOR THE ACTIVE CHAT.
  ============================================================ */

  useEffect(() => {
    if (!conversation.id) {
      return;
    }

    /*
     * Reset the local pending message map
     * when switching conversations.
     */
    pendingMessages.current.clear();

    const messagesRef =
      collection(
        db,
        'conversations',
        conversation.id,
        'messages'
      );

    const messagesQuery =
      query(
        messagesRef,
        orderBy(
          'timestamp',
          'desc'
        ),
        limit(50)
      );

    const unsubscribe =
      onSnapshot(
        messagesQuery,
        (snapshot) => {
          const loadedMessages =
            snapshot.docs
              .map((messageDoc) => {
                const data =
                  messageDoc.data();

                const pending =
                  pendingMessages.current.get(
                    messageDoc.id
                  );

                return {
                  id: messageDoc.id,
                  ...data,
                  timestamp:
                    data.timestamp ||
                    pending?.timestamp ||
                    null,
                } as Message;
              })
              .reverse();

          /*
           * Remove confirmed optimistic
           * messages from the pending map.
           */
          snapshot.docs.forEach(
            (messageDoc) => {
              const data =
                messageDoc.data();

              if (
                data.timestamp
              ) {
                pendingMessages.current.delete(
                  messageDoc.id
                );
              }
            }
          );

          const serverIds =
            new Set(
              loadedMessages.map(
                (message) =>
                  message.id
              )
            );

          const localOnly =
            Array.from(
              pendingMessages.current.values()
            ).filter(
              (message) =>
                !serverIds.has(
                  message.id
                )
            );

          const combined = [
            ...loadedMessages,
            ...localOnly,
          ].sort(
            (a, b) =>
              getTimestampMs(
                a.timestamp
              ) -
              getTimestampMs(
                b.timestamp
              )
          );

          setMessages(
            combined
          );

          /*
           * Update only incoming messages
           * that have not already been read.
           *
           * We deliberately do NOT update
           * messages that already have readAt.
           */
          const unreadIncoming =
            snapshot.docs.filter(
              (messageDoc) => {
                const data =
                  messageDoc.data();

                return (
                  data.senderId !==
                    currentUser.uid &&
                  !data.readAt
                );
              }
            );

          if (
            unreadIncoming.length === 0
          ) {
            return;
          }

          /*
           * Each message needs its own update
           * because each message document needs
           * its own readAt/deliveredAt state.
           */
          const statusUpdates =
            unreadIncoming.map(
              (messageDoc) =>
                updateDoc(
                  doc(
                    db,
                    'conversations',
                    conversation.id,
                    'messages',
                    messageDoc.id
                  ),
                  {
                    deliveredAt:
                      messageDoc.data()
                        .deliveredAt ||
                      serverTimestamp(),

                    readAt:
                      serverTimestamp(),
                  }
                )
            );

          Promise.all(
            statusUpdates
          ).catch((error) => {
            console.error(
              'Failed to update message status:',
              error
            );
          });
        },
        (error) => {
          console.error(
            'Messages listener error:',
            error
          );
        }
      );

    return unsubscribe;
  }, [
    conversation.id,
    currentUser.uid,
  ]);

  /* ============================================================
     SEND MESSAGE
============================================================ */

  function handleSendMessage(
    e?: React.FormEvent
  ) {
    e?.preventDefault();

    const text =
      newMessage.trim();

    if (
      !text ||
      sending ||
      !otherId ||
      !conversation.id
    ) {
      return;
    }

    const messageRef =
      doc(
        collection(
          db,
          'conversations',
          conversation.id,
          'messages'
        )
      );

    const localTimestamp =
      new Date();

    const senderName =
      currentUser.displayName ||
      currentUser.username ||
      'User';

    const senderPhoto =
      currentUser.photoURL ||
      '';

    const optimisticMessage:
      Message = {
      id: messageRef.id,

      text,

      senderId:
        currentUser.uid,

      senderName,

      senderPhoto,

      timestamp:
        localTimestamp,

      deliveredAt:
        null,

      readAt:
        null,
    };

    pendingMessages.current.set(
      messageRef.id,
      optimisticMessage
    );

    /*
     * Display immediately.
     */
    setMessages(
      (previous) => [
        ...previous,
        optimisticMessage,
      ]
    );

    setNewMessage('');

    /*
     * The input is immediately
     * available again.
     */
    setSending(false);

    /*
     * WRITE #1:
     * Create the message.
     */
    setDoc(
      messageRef,
      {
        text,

        senderId:
          currentUser.uid,

        senderName,

        senderPhoto,

        timestamp:
          serverTimestamp(),

        deliveredAt:
          null,

        readAt:
          null,
      }
    )
      .then(() => {
        /*
         * WRITE #2:
         * Update conversation preview
         * and recipient unread count.
         *
         * This write is necessary for
         * the current conversation-list design.
         */
        return updateDoc(
          doc(
            db,
            'conversations',
            conversation.id
          ),
          {
            lastMessage: {
              text,

              senderId:
                currentUser.uid,

              timestamp:
                serverTimestamp(),
            },

            updatedAt:
              serverTimestamp(),

            [`unreadCounts.${otherId}`]:
              increment(1),
          }
        );
      })
      .catch((error) => {
        console.error(
          'Failed to send message:',
          error
        );

        pendingMessages.current.delete(
          messageRef.id
        );

        setMessages(
          (previous) =>
            previous.filter(
              (message) =>
                message.id !==
                messageRef.id
            )
        );

        setNewMessage(
          (previous) =>
            previous
              ? `${text}\n${previous}`
              : text
        );
      });
  }

  /* ============================================================
     TIMESTAMP HELPERS
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

  function formatLastSeen(
    timestamp: any
  ) {
    if (!timestamp) {
      return '';
    }

    try {
      const date =
        timestamp.toDate
          ? timestamp.toDate()
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

      const yesterday =
        new Date(now);

      yesterday.setDate(
        now.getDate() - 1
      );

      const isYesterday =
        date.toDateString() ===
        yesterday.toDateString();

      const time =
        date.toLocaleTimeString(
          [],
          {
            hour: 'numeric',
            minute: '2-digit',
          }
        );

      if (sameDay) {
        return `last seen today at ${time}`;
      }

      if (isYesterday) {
        return `last seen yesterday at ${time}`;
      }

      const datePart =
        date.toLocaleDateString(
          [],
          {
            month: 'short',
            day: 'numeric',
          }
        );

      return `last seen ${datePart} at ${time}`;
    } catch {
      return '';
    }
  }

  function formatMessageTime(
    timestamp: any
  ) {
    if (!timestamp) {
      return '';
    }

    try {
      const date =
        timestamp.toDate
          ? timestamp.toDate()
          : new Date(timestamp);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return '';
      }

      return date.toLocaleTimeString(
        [],
        {
          hour: '2-digit',
          minute: '2-digit',
        }
      );
    } catch {
      return '';
    }
  }

  /* ============================================================
     READ RECEIPT
============================================================ */

  function ReadReceipt({
    message,
  }: {
    message: Message;
  }) {
    if (
      message.senderId !==
      currentUser.uid
    ) {
      return null;
    }

    if (!message.deliveredAt) {
      return (
        <span className="inline-flex items-center ml-1 text-purple-200">
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4 4L19 6.5" />
          </svg>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center ml-1 ${
          message.readAt
            ? 'text-blue-400'
            : 'text-purple-200'
        }`}
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 12.5l4 4L14 9" />
          <path d="M9 16.5l2.5 2.5L21.5 9" />
        </svg>
      </span>
    );
  }

  /* ============================================================
     PROFILE POPUP
============================================================ */

  const profilePopup =
    showProfile &&
    mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
            onClick={() =>
              setShowProfile(false)
            }
          >
            <div
              className="relative w-full max-w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] overflow-y-auto"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <button
                type="button"
                onClick={() =>
                  setShowProfile(false)
                }
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
                aria-label="Close profile"
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
                    d="M6 6l12 12M18 6L6 18"
                  />
                </svg>
              </button>

              <div className="px-6 pt-8 pb-6">
                <div className="flex justify-center">
                  <Avatar
                    photoURL={
                      otherProfile.photoURL
                    }
                    name={
                      otherProfile.displayName
                    }
                    username={
                      otherProfile.username
                    }
                    className="w-32 h-32 rounded-full border border-gray-200 shadow-md"
                  />
                </div>

                <div className="mt-4 flex items-center justify-center gap-1.5">
                  <h2 className="text-xl font-bold text-gray-900 text-center break-words">
                    {otherProfile.displayName ||
                      'User'}
                  </h2>

                  {otherProfile.verified && (
                    <VerifiedBadge />
                  )}
                </div>

                <p className="mt-1 text-sm text-gray-500 text-center break-all">
                  @
                  {otherProfile.username ||
                    'username'}
                </p>

                {(otherOnline ||
                  otherLastSeen) && (
                  <p
                    className={`mt-2 text-xs text-center ${
                      otherOnline
                        ? 'text-green-600'
                        : 'text-gray-400'
                    }`}
                  >
                    {otherOnline
                      ? 'Online'
                      : formatLastSeen(
                          otherLastSeen
                        )}
                  </p>
                )}

                <div className="border-t border-gray-100 my-5" />

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center mb-2">
                    Bio
                  </p>

                  {otherProfile.bio?.trim() ? (
                    <p className="text-sm text-gray-700 text-center leading-6 whitespace-pre-wrap break-words">
                      {otherProfile.bio}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic text-center">
                      No bio yet.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowProfile(false)
                  }
                  className="w-full mt-6 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  /* ============================================================
     UI
============================================================ */

  return (
    <>
      <div className="h-full flex flex-col bg-gray-50 relative">

        {/* HEADER */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-2.5">

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="md:hidden flex-shrink-0 w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
                aria-label="Back"
              >
                <svg
                  className="w-5 h-5 text-gray-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setShowProfile(true)
              }
              className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg hover:bg-gray-50 px-1 py-0.5 transition-colors"
            >
              <Avatar
                photoURL={
                  otherProfile.photoURL
                }
                name={
                  otherProfile.displayName
                }
                username={
                  otherProfile.username
                }
                className="w-10 h-10 rounded-full flex-shrink-0"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">
                    {otherProfile.displayName ||
                      'User'}
                  </h2>

                  {otherProfile.verified && (
                    <VerifiedBadge />
                  )}
                </div>

                <p
                  className={`text-[11px] leading-4 truncate ${
                    otherOnline
                      ? 'text-green-600'
                      : 'text-gray-500'
                  }`}
                >
                  {otherOnline
                    ? 'online'
                    : otherLastSeen
                    ? formatLastSeen(
                        otherLastSeen
                      )
                    : ''}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-2">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center px-6">
                <Avatar
                  photoURL={
                    otherProfile.photoURL
                  }
                  name={
                    otherProfile.displayName
                  }
                  username={
                    otherProfile.username
                  }
                  className="w-16 h-16 rounded-full mx-auto mb-3"
                />

                <p className="text-sm font-medium text-gray-700">
                  Start a conversation with{' '}
                  {otherProfile.displayName ||
                    'this user'}
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  Send your first message below.
                </p>
              </div>
            </div>
          ) : (
            messages.map(
              (message) => {
                const isOwn =
                  message.senderId ===
                  currentUser.uid;

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isOwn
                        ? 'justify-end'
                        : 'justify-start'
                    }`}
                  >
                    <div
                      className={`flex items-end gap-1.5 max-w-[82%] sm:max-w-[70%] ${
                        isOwn
                          ? 'flex-row-reverse'
                          : ''
                      }`}
                    >
                      {!isOwn && (
                        <Avatar
                          photoURL={
                            otherProfile.photoURL ||
                            message.senderPhoto
                          }
                          name={
                            otherProfile.displayName ||
                            message.senderName
                          }
                          username={
                            otherProfile.username
                          }
                          className="w-7 h-7 rounded-full flex-shrink-0"
                        />
                      )}

                      <div
                        className={`px-3 py-1.5 ${
                          isOwn
                            ? 'bg-purple-600 text-white rounded-[14px] rounded-br-[5px]'
                            : 'bg-white text-gray-900 border border-gray-200 rounded-[14px] rounded-bl-[5px]'
                        }`}
                      >
                        <p className="text-[14px] leading-5 whitespace-pre-wrap break-words">
                          {message.text}
                        </p>

                        <div
                          className={`text-[9px] mt-0.5 text-right flex items-center justify-end ${
                            isOwn
                              ? 'text-purple-200'
                              : 'text-gray-400'
                          }`}
                        >
                          {formatMessageTime(
                            message.timestamp
                          )}

                          <ReadReceipt
                            message={
                              message
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            )
          )}
        </div>

        {/* INPUT */}
        <form
          onSubmit={
            handleSendMessage
          }
          className="flex-shrink-0 bg-white border-t border-gray-200 p-3"
        >
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              value={newMessage}
              onChange={(e) =>
                setNewMessage(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey
                ) {
                  e.preventDefault();

                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent max-h-32"
            />

            <button
              type="submit"
              disabled={
                sending ||
                !newMessage.trim()
              }
              className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex-shrink-0"
              aria-label="Send message"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-[18px] h-[18px]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22" />
                  <path d="M11 13L2 9L22 2Z" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>

      {profilePopup}
    </>
  );
}