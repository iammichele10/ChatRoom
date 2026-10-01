'use client';

import { useRef, useState } from 'react';
import {
  doc,
  updateDoc,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

import { db, storage } from '@/lib/firebase';
import { UserProfile } from '@/types';

interface SettingsPanelProps {
  user: UserProfile;
  onClose: () => void;
  onProfileUpdated: (
    updatedProfile: UserProfile
  ) => void;
}

export default function SettingsPanel({
  user,
  onClose,
  onProfileUpdated,
}: SettingsPanelProps) {
  const [photoURL, setPhotoURL] = useState(
    user.photoURL || ''
  );

  const [bio, setBio] = useState(
    user.bio || ''
  );

  const [uploading, setUploading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [saved, setSaved] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  async function handlePhotoUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(
        'Image must be less than 5MB.'
      );
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError(
        'Please select an image file.'
      );
      return;
    }

    setUploading(true);
    setError('');
    setSaved(false);

    try {
      const storageRef = ref(
        storage,
        `profile-pics/${user.uid}`
      );

      await uploadBytes(
        storageRef,
        file
      );

      const url =
        await getDownloadURL(
          storageRef
        );

      setPhotoURL(url);

      /*
       * Save the new photo immediately.
       */
      await updateDoc(
        doc(db, 'users', user.uid),
        {
          photoURL: url,
        }
      );

      onProfileUpdated({
        ...user,
        photoURL: url,
        bio,
      });
    } catch (error) {
      console.error(
        'Profile photo update error:',
        error
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          'Failed to change profile picture.'
        );
      }
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const cleanBio = bio.trim();

      await updateDoc(
        doc(db, 'users', user.uid),
        {
          bio: cleanBio,
          photoURL,
        }
      );

      const updatedProfile: UserProfile = {
        ...user,
        bio: cleanBio,
        photoURL,
      };

      onProfileUpdated(
        updatedProfile
      );

      setBio(cleanBio);
      setSaved(true);
    } catch (error) {
      console.error(
        'Profile update error:',
        error
      );

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          'Failed to save your changes.'
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-200 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Back to Recents"
        >
          <svg
            className="w-6 h-6 text-gray-700"
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

        <h2 className="text-lg font-semibold text-gray-900">
          Settings
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-6">

          {/* Profile picture */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <img
                src={
                  photoURL ||
                  '/default-avatar.png'
                }
                alt={
                  user.displayName ||
                  'Profile'
                }
                className="w-28 h-28 rounded-full object-cover border-4 border-gray-100"
              />

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={
                  uploading ||
                  saving
                }
                className="absolute bottom-0 right-0 w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-purple-700 disabled:opacity-50"
                aria-label="Change profile picture"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            <p className="text-sm text-gray-500 mt-3">
              Tap the camera to change your photo
            </p>
          </div>

          {/* Profile information */}
          <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden">

            <div className="px-4 py-3 border-b border-gray-200">
              <p className="text-xs uppercase tracking-wide text-gray-400">
                Profile
              </p>
            </div>

            {/* Name */}
            <div className="px-4 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400">
                Name
              </p>

              <p className="text-gray-900 mt-1">
                {user.displayName ||
                  'Not set'}
              </p>
            </div>

            {/* Username */}
            <div className="px-4 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400">
                Username
              </p>

              <p className="text-gray-900 mt-1">
                @{user.username}
              </p>
            </div>

            {/* Bio */}
            <div className="px-4 py-4">
              <label className="block text-xs text-gray-400 mb-2">
                Bio
              </label>

              <textarea
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  setSaved(false);
                }}
                placeholder="Tell people about yourself..."
                maxLength={150}
                rows={4}
                disabled={
                  saving ||
                  uploading
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />

              <div className="text-xs text-gray-400 text-right mt-1">
                {bio.length}/150
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm break-words">
              {error}
            </div>
          )}

          {/* Saved */}
          {saved && !error && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm">
              Your profile has been updated.
            </div>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              uploading
            }
            className="w-full mt-5 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {saving && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}

            {saving
              ? 'Saving...'
              : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}