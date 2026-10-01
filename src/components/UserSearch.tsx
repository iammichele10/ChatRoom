'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';
import VerifiedBadge from './VerifiedBadge';

interface UserSearchProps {
  onSelectUser: (user: UserProfile) => void;
  excludeUids: string[];
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSearch({
  onSelectUser,
  excludeUids,
  isOpen,
  onClose,
}: UserSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setResults([]);
      return;
    }

    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    const searchUsers = async () => {
      setSearching(true);

      try {
        const usersRef = collection(db, 'users');

        const usernameQuery = query(
          usersRef,
          where(
            'username',
            '>=',
            searchTerm.toLowerCase()
          ),
          where(
            'username',
            '<=',
            searchTerm.toLowerCase() + '\uf8ff'
          ),
          limit(10)
        );

        const nameQuery = query(
          usersRef,
          where(
            'displayName',
            '>=',
            searchTerm
          ),
          where(
            'displayName',
            '<=',
            searchTerm + '\uf8ff'
          ),
          limit(10)
        );

        const [
          usernameSnap,
          nameSnap,
        ] = await Promise.all([
          getDocs(usernameQuery),
          getDocs(nameQuery),
        ]);

        const usersMap =
          new Map<string, UserProfile>();

        usernameSnap.forEach((userDoc) => {
          const foundUser =
            userDoc.data() as UserProfile;

          if (
            !excludeUids.includes(foundUser.uid) &&
            foundUser.profileComplete
          ) {
            usersMap.set(
              foundUser.uid,
              foundUser
            );
          }
        });

        nameSnap.forEach((userDoc) => {
          const foundUser =
            userDoc.data() as UserProfile;

          if (
            !excludeUids.includes(foundUser.uid) &&
            foundUser.profileComplete
          ) {
            usersMap.set(
              foundUser.uid,
              foundUser
            );
          }
        });

        setResults(
          Array.from(usersMap.values())
        );
      } catch (error) {
        console.error(
          'Search error:',
          error
        );
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(
      searchUsers,
      300
    );

    return () =>
      clearTimeout(debounce);
  }, [
    searchTerm,
    excludeUids,
    isOpen,
  ]);

  function handleSelectUser(user: UserProfile) {
    onSelectUser(user);
    setSearchTerm('');
    setResults([]);
    onClose();
  }

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isOpen
          ? 'max-h-96 opacity-100'
          : 'max-h-0 opacity-0'
      }`}
    >
      <div className="px-4 pb-3 pt-1">
        <div className="relative">
          <input
            autoFocus={isOpen}
            type="text"
            value={searchTerm}
            onChange={(e) =>
              setSearchTerm(e.target.value)
            }
            placeholder="Search by username or name..."
            className="w-full px-4 py-2.5 pl-10 pr-10 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          {/* Search icon */}
          <svg
            className="w-5 h-5 text-gray-400 absolute left-3 top-3"
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

          {/* Close search */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-1.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Close search"
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

          {searching && (
            <div className="absolute right-11 top-3">
              <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            {results.map((foundUser) => (
              <button
                key={foundUser.uid}
                type="button"
                onClick={() =>
                  handleSelectUser(foundUser)
                }
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50"
              >
                <img
                  src={
                    foundUser.photoURL ||
                    '/default-avatar.png'
                  }
                  alt={
                    foundUser.displayName ||
                    'User'
                  }
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />

                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900 truncate">
                      {foundUser.displayName ||
                        'User'}
                    </span>

                    {foundUser.verified && (
                      <VerifiedBadge />
                    )}
                  </div>

                  <div className="text-sm text-gray-500 truncate">
                    @{foundUser.username}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {searchTerm.trim() &&
          !searching &&
          results.length === 0 && (
            <div className="mt-2 p-4 text-center text-sm text-gray-500">
              No users found
            </div>
          )}
      </div>
    </div>
  );
}