'use client';

import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Room } from '@/types';
import { logOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  selectedRoom: string | null;
  onSelectRoom: (roomId: string) => void;
  currentUser: any;
}

export default function Sidebar({ selectedRoom, onSelectRoom, currentUser }: SidebarProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const q = query(
      collection(db, 'rooms'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Room[];
      setRooms(roomsData);
    });

    return unsubscribe;
  }, []);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setCreating(true);
    try {
      await addDoc(collection(db, 'rooms'), {
        name: newRoomName.trim(),
        description: newRoomDesc.trim(),
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    await logOut();
    router.push('/');
  }

  return (
    <div className="h-full flex flex-col w-64">
      {/* User Profile */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <img 
            src={currentUser.photoURL || ''} 
            alt={currentUser.displayName || 'User'}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate">
              {currentUser.displayName}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {currentUser.email}
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Sign out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">Chat Rooms</h2>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
            {rooms.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Room
        </button>
      </div>

      {/* Room List */}
      <div className="flex-1 overflow-y-auto p-2">
        {rooms.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 text-sm">No rooms yet</p>
            <p className="text-gray-400 text-xs">Create your first room!</p>
          </div>
        ) : (
          rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className={`w-full text-left p-3 rounded-lg mb-1 transition-all ${
                selectedRoom === room.id 
                  ? 'bg-blue-50 border-l-4 border-blue-600' 
                  : 'hover:bg-gray-100 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400">#</span>
                <span className="font-semibold text-gray-800 truncate">{room.name}</span>
              </div>
              {room.description && (
                <div className="text-sm text-gray-500 truncate mt-1 ml-5">
                  {room.description}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Room</h3>
            <form onSubmit={createRoom}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., general, random, tech-talk"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  maxLength={50}
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  placeholder="What's this room about?"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                  maxLength={200}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={creating}
                >
                  {creating && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
