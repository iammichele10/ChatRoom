'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conversation, Message, UserProfile } from '@/types';
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

export default function ChatWindow({
  conversation,
  otherUser,
  currentUser,
  onBack,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [otherLastSeen, setOtherLastSeen] =
    useState<any>(null);

  const [otherOnline, setOtherOnline] =
    useState(false);

  const [showProfile, setShowProfile] =
    useState(false);

  const [mounted, setMounted] = useState(false);

  const [otherProfile, setOtherProfile] =
    useState<OtherProfile>({
      username: otherUser?.username || '',
      displayName:
        otherUser?.displayName || 'User',
      photoURL: otherUser?.photoURL || '',
      verified: otherUser?.verified || false,
      bio: '',
    });

  const otherId =
    conversation.participants.find(
      (id) => id !== currentUser.uid
    ) || '';

  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);
    };
  }, []);

  /*
   * Keep profile synchronized with the
   * information already available.
   */
  useEffect(() => {
    setOtherProfile((previous) => ({
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
      bio: previous.bio || '',
    }));
  }, [
    otherUser?.username,
    otherUser?.displayName,
    otherUser?.photoURL,
    otherUser?.verified,
  ]);

  /*
   * Listen for the other person's profile,
   * online status and last seen.
   */
  useEffect(() => {
    if (!otherId) return;

    const userRef = doc(
      db,
      'users',
      otherId
    );

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data();

        setOtherProfile((previous) => ({
          username:
            typeof data.username === 'string' &&
            data.username.trim()
              ? data.username
              : previous.username,

          displayName:
            typeof data.displayName === 'string' &&
            data.displayName.trim()
              ? data.displayName
              : previous.displayName,

          photoURL:
            typeof data.photoURL === 'string' &&
            data.photoURL.trim()
              ? data.photoURL
              : previous.photoURL,

          verified:
            typeof data.verified === 'boolean'
              ? data.verified
              : previous.verified,

          bio:
            typeof data.bio === 'string'
              ? data.bio
              : previous.bio,
        }));

        setOtherLastSeen(
          data.lastSeen || null
        );

        setOtherOnline(
          data.online === true
        );
      },
      (error) => {
        console.error(
          'Profile listener error:',
          error
        );
      }
    );

    return unsubscribe;
  }, [otherId]);

  /*
   * Listen for messages.
   */
  useEffect(() => {
    if (!conversation.id) return;

    const messagesRef = collection(
      db,
      'conversations',
      conversation.id,
      'messages'
    );

    const messagesQuery = query(
      messagesRef,
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      async (snapshot) => {
        const loadedMessages = snapshot.docs
          .map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data(),
          }))
          .reverse() as Message[];

        setMessages(loadedMessages);

        const updates: Promise<void>[] = [];

        snapshot.docs.forEach((messageDoc) => {
          const data = messageDoc.data();

          if (
            data.senderId !== currentUser.uid &&
            !data.readAt
          ) {
            updates.push(
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
                    data.deliveredAt ||
                    serverTimestamp(),
                  readAt: serverTimestamp(),
                }
              )
            );
          }
        });

        if (updates.length > 0) {
          try {
            await Promise.all(updates);
          } catch (error) {
            console.error(
              'Failed to update message status:',
              error
            );
          }
        }
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

  /*
   * Send message.
   */
  async function handleSendMessage(
    e?: React.FormEvent
  ) {
    e?.preventDefault();

    const text = newMessage.trim();

    if (!text || sending) return;

    setSending(true);
    setNewMessage('');

    try {
      await addDoc(
        collection(
          db,
          'conversations',
          conversation.id,
          'messages'
        ),
        {
          text,
          senderId: currentUser.uid,
          senderName:
            currentUser.displayName ||
            currentUser.username ||
            'User',
          senderPhoto:
            currentUser.photoURL || '',
          timestamp: serverTimestamp(),
          deliveredAt: null,
          readAt: null,
        }
      );

      await updateDoc(
        doc(
          db,
          'conversations',
          conversation.id
        ),
        {
          lastMessage: {
            text,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        }
      );
    } catch (error) {
      console.error(
        'Failed to send message:',
        error
      );

      setNewMessage(text);
    } finally {
      setSending(false);
    }
  }

  /*
   * Format last seen like WhatsApp.
   */
  function formatLastSeen(timestamp: any) {
    if (!timestamp) return '';

    try {
      const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      const now = new Date();

      const sameDay =
        date.toDateString() ===
        now.toDateString();

      const yesterday = new Date(now);
      yesterday.setDate(
        now.getDate() - 1
      );

      const isYesterday =
        date.toDateString() ===
        yesterday.toDateString();

      const time = date.toLocaleTimeString(
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
        date.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        });

      return `last seen ${datePart} at ${time}`;
    } catch {
      return '';
    }
  }

  /*
   * Format message time.
   */
  function formatMessageTime(
    timestamp: any
  ) {
    if (!timestamp) return '';

    try {
      const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  /*
   * Profile popup.
   */
  const profilePopup =
    showProfile && mounted
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
                  <img
                    src={
                      otherProfile.photoURL ||
                      '/default-avatar.png'
                    }
                    alt={
                      otherProfile.displayName ||
                      'Profile'
                    }
                    className="w-32 h-32 rounded-full object-cover border border-gray-200 shadow-md"
                    onError={(e) => {
                      e.currentTarget.src =
                        '/default-avatar.png';
                    }}
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

  return (
    <>
      <div className="h-full flex flex-col bg-gray-50 relative">

        {/* CHAT HEADER */}
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

            {/* Person header */}
            <button
              type="button"
              onClick={() =>
                setShowProfile(true)
              }
              className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg hover:bg-gray-50 px-1 py-0.5 transition-colors"
            >
              <img
                src={
                  otherProfile.photoURL ||
                  '/default-avatar.png'
                }
                alt={
                  otherProfile.displayName ||
                  'User'
                }
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.src =
                    '/default-avatar.png';
                }}
              />

              <div className="min-w-0 flex-1">

                {/* Name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">
                    {otherProfile.displayName ||
                      'User'}
                  </h2>

                  {otherProfile.verified && (
                    <VerifiedBadge />
                  )}
                </div>

                {/* WhatsApp-style status */}
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
                <img
                  src={
                    otherProfile.photoURL ||
                    '/default-avatar.png'
                  }
                  alt={
                    otherProfile.displayName ||
                    'User'
                  }
                  className="w-16 h-16 rounded-full object-cover mx-auto mb-3"
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
            messages.map((message) => {
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
                      <img
                        src={
                          otherProfile.photoURL ||
                          message.senderPhoto ||
                          '/default-avatar.png'
                        }
                        alt=""
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
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
                        className={`text-[9px] mt-0.5 text-right ${
                          isOwn
                            ? 'text-purple-200'
                            : 'text-gray-400'
                        }`}
                      >
                        {formatMessageTime(
                          message.timestamp
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INPUT */}
        <form
          onSubmit={handleSendMessage}
          className="flex-shrink-0 bg-white border-t border-gray-200 p-3"
        >
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              value={newMessage}
              onChange={(e) =>
                setNewMessage(e.target.value)
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
              className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                    d="M5 12h14M12 5l7-7"
                  />
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