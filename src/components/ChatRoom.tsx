'use client';

import { useEffect, useState, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit,
  addDoc,
  serverTimestamp,
  onSnapshot,
  doc
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Message } from '@/types';

interface ChatRoomProps {
  roomId: string;
}

export default function ChatRoom({ roomId }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomName, setRoomName] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get room details
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (docSnapshot) => {
      if (docSnapshot.exists()) {
        setRoomName(docSnapshot.data().name);
      }
    });
    return unsubscribe;
  }, [roomId]);

  // Listen to messages in this room
  useEffect(() => {
    const q = query(
      collection(db, 'rooms', roomId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs.reverse());
    });

    return unsubscribe;
  }, [roomId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when room changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [roomId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        text: newMessage.trim(),
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName,
        photoURL: auth.currentUser.photoURL,
        createdAt: serverTimestamp()
      });
      setNewMessage('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <>
      {/* Room Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <span className="text-gray-400">#</span>
            {roomName}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.uid === auth.currentUser?.uid;
            const showAvatar = index === 0 || messages[index - 1].uid !== msg.uid;

            return (
              <div 
                key={msg.id} 
                className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''} ${showAvatar ? 'mt-4' : 'mt-1'}`}
              >
                {showAvatar ? (
                  <img 
                    src={msg.photoURL || ''} 
                    alt={msg.displayName}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 flex-shrink-0" />
                )}

                <div className={`max-w-xs lg:max-w-md ${isOwn ? 'text-right' : ''}`}>
                  {showAvatar && (
                    <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <span className="text-sm font-semibold text-gray-700">
                        {msg.displayName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className={`inline-block p-3 rounded-2xl ${
                    isOwn 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
                  }`}>
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="p-4 bg-white border-t border-gray-200">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message #${roomName}`}
              className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              maxLength={1000}
              disabled={sending}
            />
            <span className="absolute right-3 bottom-3 text-xs text-gray-400">
              {newMessage.length}/1000
            </span>
          </div>
          <button 
            type="submit" 
            disabled={!newMessage.trim() || sending}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </form>
    </>
  );
}
