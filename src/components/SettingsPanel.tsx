'use client';

import { useRef, useState } from 'react';

import {
  doc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';

interface SettingsPanelProps {
  user: UserProfile;
  onClose: () => void;
  onProfileUpdated: (
    updatedProfile: UserProfile
  ) => void;
}

async function uploadToCloudinary(
  file: File
): Promise<string> {
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

  formData.append(
    'file',
    file
  );

  formData.append(
    'upload_preset',
    uploadPreset
  );

  formData.append(
    'folder',
    'chatlinked/profile-pictures'
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const data = await response.json();

  if (
    !response.ok ||
    !data.secure_url
  ) {
    console.error(
      'Cloudinary upload error:',
      data
    );

    throw new Error(
      data?.error?.message ||
        'Failed to upload profile picture.'
    );
  }

  return data.secure_url;
}

export default function SettingsPanel({
  user,
  onClose,
  onProfileUpdated,
}: SettingsPanelProps) {
  const [photoURL, setPhotoURL] =
    useState(
      user.photoURL || ''
    );

  const [bio, setBio] =
    useState(
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
    const file =
      e.target.files?.[0];

    if (!file) return;

    if (
      !file.type.startsWith(
        'image/'
      )
    ) {
      setError(
        'Please select an image file.'
      );

      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setError(
        'Image must be less than 5MB.'
      );

      return;
    }

    setUploading(true);
    setError('');
    setSaved(false);

    try {
      const url =
        await uploadToCloudinary(
          file
        );

      setPhotoURL(url);

      await updateDoc(
        doc(
          db,
          'users',
          user.uid
        ),
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

      if (
        error instanceof Error
      ) {
        setError(
          error.message
        );
      } else {
        setError(
          'Failed to change profile picture.'
        );
      }
    } finally {
      setUploading(false);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          '';
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const cleanBio =
        bio.trim();

      await updateDoc(
        doc(
          db,
          'users',
          user.uid
        ),
        {
          bio: cleanBio,
          photoURL,
        }
      );

      const updatedProfile:
        UserProfile = {
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

      if (
        error instanceof Error
      ) {
        setError(
          error.message
        );
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
    <div className="absolute inset-0 z-50 bg-gray-50 flex flex-col">

      {/* =====================================================
          SETTINGS HEADER
      ===================================================== */}
      <div className="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-3">

        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-700 hover:bg-gray-100 active:bg-gray-200 active:scale-95 transition-all"
          aria-label="Back"
          title="Back"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <h2 className="ml-2 text-lg font-semibold text-gray-900">
          Settings
        </h2>
      </div>

      {/* =====================================================
          CONTENT
      ===================================================== */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        <div className="w-full max-w-xl mx-auto px-5 py-7">

          {/* =================================================
              PROFILE PHOTO
          ================================================= */}
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
                className="w-28 h-28 rounded-full object-cover border border-gray-200 shadow-sm"
                onError={(e) => {
                  e.currentTarget.src =
                    '/default-avatar.png';
                }}
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
                className="absolute right-0 bottom-0 w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-md hover:bg-purple-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                aria-label="Change profile picture"
                title="Change profile picture"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
                    <circle
                      cx="12"
                      cy="13"
                      r="3"
                    />
                  </svg>
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={
                  handlePhotoUpload
                }
                className="hidden"
              />
            </div>

            <p className="text-sm text-gray-500 mt-3">
              Tap the camera to change your photo
            </p>
          </div>

          {/* =================================================
              PROFILE INFORMATION
          ================================================= */}
          <div className="mt-8 bg-white border border-gray-200 rounded-2xl overflow-hidden">

            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Profile
              </h3>
            </div>

            {/* NAME */}
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Name
              </p>

              <p className="text-gray-900 mt-1">
                {user.displayName ||
                  'Not set'}
              </p>
            </div>

            {/* USERNAME */}
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Username
              </p>

              <p className="text-gray-900 mt-1">
                @{user.username}
              </p>
            </div>

            {/* BIO */}
            <div className="px-5 py-4">

              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Bio
              </label>

              <textarea
                value={bio}
                onChange={(e) => {
                  setBio(
                    e.target.value
                  );

                  setSaved(false);
                  setError('');
                }}
                placeholder="Tell people about yourself..."
                maxLength={150}
                rows={4}
                disabled={
                  saving ||
                  uploading
                }
                className="w-full px-3 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60"
              />

              <div className="text-xs text-gray-400 text-right mt-1">
                {bio.length}/150
              </div>

            </div>
          </div>

          {/* =================================================
              ERROR
          ================================================= */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm break-words">
              {error}
            </div>
          )}

          {/* =================================================
              SAVED
          ================================================= */}
          {saved && !error && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-xl text-sm">
              Your profile has been updated.
            </div>
          )}

          {/* =================================================
              SAVE
          ================================================= */}
          <button
            type="button"
            onClick={
              handleSave
            }
            disabled={
              saving ||
              uploading
            }
            className="w-full mt-5 py-3.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 active:bg-purple-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all"
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