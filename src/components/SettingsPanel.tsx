'use client';

import {
  useRef,
  useState,
} from 'react';

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

  const text =
    value || 'user';

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
    Math.abs(total) %
      colors.length
  ];
}

/* ============================================================
   IMAGE COMPRESSION
============================================================ */

async function compressImage(
  file: File
): Promise<File> {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      const objectUrl =
        URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(
          objectUrl
        );

        const maxSize = 600;

        let width =
          image.naturalWidth;

        let height =
          image.naturalHeight;

        if (
          width > maxSize ||
          height > maxSize
        ) {
          const scale =
            Math.min(
              maxSize / width,
              maxSize / height
            );

          width = Math.round(
            width * scale
          );

          height = Math.round(
            height * scale
          );
        }

        const canvas =
          document.createElement(
            'canvas'
          );

        canvas.width = width;
        canvas.height = height;

        const context =
          canvas.getContext(
            '2d'
          );

        if (!context) {
          reject(
            new Error(
              'Could not process image.'
            )
          );

          return;
        }

        context.imageSmoothingEnabled =
          true;

        context.imageSmoothingQuality =
          'high';

        context.drawImage(
          image,
          0,
          0,
          width,
          height
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(
                  'Could not compress image.'
                )
              );

              return;
            }

            resolve(
              new File(
                [blob],
                'chatlinked-profile.webp',
                {
                  type:
                    'image/webp',
                  lastModified:
                    Date.now(),
                }
              )
            );
          },
          'image/webp',
          0.78
        );
      };

      image.onerror = () => {
        URL.revokeObjectURL(
          objectUrl
        );

        reject(
          new Error(
            'Could not read image.'
          )
        );
      };

      image.src = objectUrl;
    }
  );
}

/* ============================================================
   CLOUDINARY
============================================================ */

async function uploadToCloudinary(
  file: File
): Promise<string> {
  const cloudName =
    process.env
      .NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  const uploadPreset =
    process.env
      .NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (
    !cloudName ||
    !uploadPreset
  ) {
    throw new Error(
      'Cloudinary is not configured. Please check your environment variables.'
    );
  }

  const compressed =
    await compressImage(file);

  const formData =
    new FormData();

  formData.append(
    'file',
    compressed
  );

  formData.append(
    'upload_preset',
    uploadPreset
  );

  formData.append(
    'folder',
    'chatlinked/profile-pictures'
  );

  const response =
    await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

  const data =
    await response.json();

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

/* ============================================================
   COMPONENT
============================================================ */

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
    useRef<HTMLInputElement>(
      null
    );

  /* ============================================================
     PHOTO UPLOAD
  ============================================================ */

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

      e.target.value = '';
      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      setError(
        'Image must be less than 10MB.'
      );

      e.target.value = '';
      return;
    }

    setError('');
    setSaved(false);
    setUploading(true);

    const previousPhotoURL =
      user.photoURL || '';

    const localPreviewURL =
      URL.createObjectURL(file);

    /*
     * Show the picture immediately.
     */
    setPhotoURL(
      localPreviewURL
    );

    onProfileUpdated({
      ...user,
      photoURL:
        localPreviewURL,
      bio,
    });

    try {
      /*
       * Upload to Cloudinary.
       */
      const url =
        await uploadToCloudinary(
          file
        );

      /*
       * Replace temporary preview
       * with permanent Cloudinary URL.
       */
      setPhotoURL(url);

      onProfileUpdated({
        ...user,
        photoURL: url,
        bio,
      });

      /*
       * STOP spinner immediately.
       *
       * Firestore is no longer allowed
       * to control the upload button.
       */
      setUploading(false);

      URL.revokeObjectURL(
        localPreviewURL
      );

      /*
       * Save Firebase copy in the
       * background.
       */
      updateDoc(
        doc(
          db,
          'users',
          user.uid
        ),
        {
          photoURL: url,
        }
      ).catch((firestoreError) => {
        console.error(
          'Profile photo Firestore update error:',
          firestoreError
        );

        setError(
          'The picture uploaded, but Firebase could not save it. Your picture is still visible.'
        );
      });
    } catch (uploadError) {
      console.error(
        'Profile photo upload error:',
        uploadError
      );

      setPhotoURL(
        previousPhotoURL
      );

      URL.revokeObjectURL(
        localPreviewURL
      );

      onProfileUpdated({
        ...user,
        photoURL:
          previousPhotoURL ||
          null,
        bio,
      });

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to change profile picture.'
      );

      setUploading(false);
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

  /* ============================================================
     SAVE CHANGES
  ============================================================ */

  function handleSave() {
    if (
      saving ||
      uploading
    ) {
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);

    const cleanBio =
      bio.trim();

    const updatedProfile:
      UserProfile = {
      ...user,
      bio: cleanBio,
      photoURL:
        photoURL || null,
    };

    /*
     * Update the application immediately.
     */
    setBio(cleanBio);

    onProfileUpdated(
      updatedProfile
    );

    /*
     * IMPORTANT:
     *
     * The UI is considered saved immediately.
     * Firebase works in the background.
     */
    setSaved(true);
    setSaving(false);

    /*
     * Firebase persistence happens
     * separately and can no longer
     * keep the button stuck on
     * "Saving...".
     */
    updateDoc(
      doc(
        db,
        'users',
        user.uid
      ),
      {
        bio: cleanBio,
        photoURL:
          photoURL || null,
      }
    ).catch((saveError) => {
      console.error(
        'Profile update error:',
        saveError
      );

      setError(
        'Your changes are visible, but Firebase could not save them to the server. Please try again later.'
      );
    });
  }

  /* ============================================================
     UI
  ============================================================ */

  const initials =
    getInitials(
      user.displayName,
      user.username
    );

  const avatarBackground =
    getAvatarBackground(
      user.displayName ||
        user.username
    );

  return (
    <div className="absolute inset-0 z-50 bg-gray-50 flex flex-col">

      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200">
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
          aria-label="Back to chats"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M15 19l-7-7 7-7"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-gray-900">
          Settings
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5">

        {/* PROFILE PHOTO */}
        <div className="flex flex-col items-center">
          <div className="relative">

            {photoURL ? (
              <img
                src={photoURL}
                alt={
                  user.displayName ||
                  'Profile'
                }
                className="w-28 h-28 rounded-full object-cover border border-gray-200 shadow-sm"
                onError={(e) => {
                  e.currentTarget.style.display =
                    'none';
                }}
              />
            ) : (
              <div
                className={`w-28 h-28 rounded-full ${avatarBackground} text-white flex items-center justify-center text-2xl font-semibold border border-gray-200 shadow-sm`}
              >
                {initials}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={
                uploading ||
                saving
              }
              className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-md hover:bg-purple-700 disabled:opacity-50"
              aria-label="Change profile picture"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M4 7h3l2-2h6l2 2h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="13"
                    r="3"
                    strokeWidth="2"
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

          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            {user.displayName ||
              'User'}
          </h3>

          <p className="text-sm text-gray-500">
            @{user.username || 'username'}
          </p>
        </div>

        {/* BIO */}
        <div className="mt-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bio
          </label>

          <textarea
            value={bio}
            onChange={(e) => {
              setBio(
                e.target.value
              );

              setSaved(false);
            }}
            maxLength={150}
            rows={5}
            placeholder="Tell people a little about yourself..."
            className="w-full resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

          <div className="text-right text-xs text-gray-400 mt-1">
            {bio.length}/150
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">
            {error}
          </div>
        )}

        {saved && (
          <div className="mt-4 rounded-xl bg-green-50 border border-green-200 text-green-600 text-sm px-3 py-2.5">
            Changes saved.
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={
            saving ||
            uploading
          }
          className="w-full mt-5 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving
            ? 'Saving...'
            : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}