'use client';

import { useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';
import { checkUsernameAvailable } from '@/lib/auth';

interface ProfileSetupProps {
  user: UserProfile;
  onComplete: () => void;
}

async function uploadToCloudinary(file: File): Promise<string> {
  const cloudName =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  const uploadPreset =
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Please check your environment variables.'
    );
  }

  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'chatlinked/profile-pictures');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok || !data.secure_url) {
    console.error('Cloudinary upload error:', data);

    throw new Error(
      data?.error?.message ||
        'Failed to upload profile picture.'
    );
  }

  return data.secure_url;
}

export default function ProfileSetup({
  user,
  onComplete,
}: ProfileSetupProps) {
  const [username, setUsername] = useState(
    user.username || ''
  );

  const [bio, setBio] = useState(
    user.bio || ''
  );

  const [photoURL, setPhotoURL] = useState(
    user.photoURL || ''
  );

  const [uploading, setUploading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  async function handlePhotoUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const url =
        await uploadToCloudinary(file);

      setPhotoURL(url);
    } catch (err) {
      console.error(
        'Profile photo upload error:',
        err
      );

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          'Failed to upload profile picture.'
        );
      }
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSave(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError('');

    const cleanUsername =
      username.trim().toLowerCase();

    if (!cleanUsername) {
      setError('Username is required');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setError(
        'Username can only contain letters, numbers, and underscores'
      );
      return;
    }

    if (cleanUsername.length < 3) {
      setError(
        'Username must be at least 3 characters'
      );
      return;
    }

    setSaving(true);

    try {
      if (
        cleanUsername !==
        (user.username || '').toLowerCase()
      ) {
        const available =
          await checkUsernameAvailable(
            cleanUsername,
            user.uid
          );

        if (!available) {
          setError(
            'Username is already taken'
          );
          setSaving(false);
          return;
        }
      }

      await setDoc(
        doc(db, 'users', user.uid),
        {
          username: cleanUsername,
          bio: bio.trim(),
          photoURL,
          profileComplete: true,
        },
        {
          merge: true,
        }
      );

      onComplete();
    } catch (err) {
      console.error(
        'Profile save error:',
        err
      );

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          'Failed to save profile'
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Set Up Your Profile
        </h1>

        <p className="text-gray-600 mb-6">
          Choose a unique username and add a photo
        </p>

        <form onSubmit={handleSave}>
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              <img
                src={
                  photoURL ||
                  '/default-avatar.png'
                }
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
              />

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="absolute bottom-0 right-0 p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors"
                disabled={
                  uploading || saving
                }
              >
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-4 h-4"
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

            <p className="text-sm text-gray-500 mt-2">
              Click camera to upload photo
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username *
            </label>

            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400">
                @
              </span>

              <input
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value.toLowerCase()
                  )
                }
                placeholder="username"
                className="w-full px-4 py-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={20}
                required
                disabled={saving}
              />
            </div>

            <p className="text-xs text-gray-500 mt-1">
              3–20 characters. Letters, numbers,
              and underscores only.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bio (optional)
            </label>

            <textarea
              value={bio}
              onChange={(e) =>
                setBio(e.target.value)
              }
              placeholder="Tell people about yourself..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-20 resize-none"
              maxLength={150}
              disabled={saving}
            />

            <p className="text-xs text-gray-400 mt-1 text-right">
              {bio.length}/150
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm break-words">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              saving || uploading
            }
            className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {saving && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}

            {saving
              ? 'Saving...'
              : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}