'use client';

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import ChatRoom from './ChatRoom';

export default function ChatApp() {
  const [user, loading] = useAuthState(auth);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Close sidebar on mobile by default
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`
        ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full'} 
        md:translate-x-0 md:w-64
        transition-all duration-300 ease-in-out
        fixed md:relative z-30 h-full
        bg-white border-r border-gray-200
        overflow-hidden
      `}>
        <Sidebar 
          selectedRoom={selectedRoom} 
          onSelectRoom={(roomId) => {
            setSelectedRoom(roomId);
            if (window.innerWidth < 768) {
              setSidebarOpen(false);
            }
          }}
          currentUser={user}
        />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-800 truncate">
              {selectedRoom ? 'Chat Room' : 'Select a room'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Online
            </div>
            <img 
              src={user.photoURL || ''} 
              alt={user.displayName || 'User'}
              className="w-8 h-8 rounded-full"
              title={user.displayName || ''}
            />
          </div>
        </div>

        {/* Chat or Empty State */}
        {selectedRoom ? (
          <ChatRoom roomId={selectedRoom} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 bg-gray-50">
            <div className="text-center max-w-sm mx-auto p-8">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No room selected</h3>
              <p className="text-gray-500 mb-6">Choose a room from the sidebar to start chatting, or create a new one.</p>
              <button 
                onClick={() => setSidebarOpen(true)}
                className="md:hidden px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Open Sidebar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
