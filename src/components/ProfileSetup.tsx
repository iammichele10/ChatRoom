'use client';

import {
  useRef,
  useState,
} from 'react';

import {
  doc,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';
import { checkUsernameAvailable } from '@/lib/auth';

interface ProfileSetupProps {
  user: UserProfile;
  onComplete: (
    updatedProfile: UserProfile
  ) => void;
}

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

        const maxSize = 1000;

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
                'chatlinked-profile.jpg',
                {
                  type:
                    'image/jpeg',
                }
              )
            );
          },
          'image/jpeg',
          0.82
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

export default function ProfileSetup({
  user,
  onComplete,
}: ProfileSetupProps) {
  const [username, setUsername] =
    useState(
      user.username || ''
    );

  const [bio, setBio] =
    useState(
      user.bio || ''
    );

  const [photoURL, setPhotoURL] =
    useState(
      user.photoURL || ''
    );

  const [uploading, setUploading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const fileInputRef =
    useRef<HTMLInputElement>(
      null
    );

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

    try {
      const url =
        await uploadToCloudinary(
          file
        );

      setPhotoURL(url);
    } catch (err) {
      console.error(
        'Profile photo upload error:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to upload profile picture.'
      );
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

  async function handleSave(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError('');

    const cleanUsername =
      username
        .trim()
        .toLowerCase();

    if (!cleanUsername) {
      setError(
        'Username is required'
      );

      return;
    }

    if (
      !/^[a-z0-9_]+$/.test(
        cleanUsername
      )
    ) {
      setError(
        'Username can only contain letters, numbers, and underscores'
      );

      return;
    }

    if (
      cleanUsername.length < 3
    ) {
      setError(
        'Username must be at least 3 characters'
      );

      return;
    }

    setSaving(true);

    try {
      if (
        cleanUsername !==
        (
          user.username || ''
        ).toLowerCase()
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

      const cleanBio =
        bio.trim();

      await setDoc(
        doc(
          db,
          'users',
          user.uid
        ),
        {
          username:
            cleanUsername,
          bio: cleanBio,
          photoURL,
          profileComplete:
            true,
        },
        {
          merge: true,
        }
      );

      const updatedProfile:
        UserProfile = {
        ...user,
        username:
          cleanUsername,
        bio: cleanBio,
        photoURL:
          photoURL || null,
        profileComplete:
          true,
      };

      /*
       * Update MainApp directly.
       * No page reload.
       */
      onComplete(
        updatedProfile
      );
    } catch (err) {
      console.error(
        'Profile save error:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save profile'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">

        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-gray-900">
            Complete your profile
          </h1>

          <p className="text-sm text-gray-500 mt-2">
            Set up your ChatLinked profile before you start chatting.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="space-y-5"
        >

          {/* PHOTO */}
          <div className="flex justify-center">
            <div className="relative">
              <img
                src={
                  photoURL ||
                  '/default-avatar.png'
                }
                alt="Profile"
                className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-md bg-gray-100"
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
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg hover:bg-purple-700 disabled:opacity-50"
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
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 7h3l2-2h6l2 2h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z"
                    />
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
          </div>

          {/* USERNAME */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Username
            </label>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                @
              </span>

              <input
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value
                  )}
                placeholder="username"
                maxLength={30}
                className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* BIO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Bio
              <span className="text-gray-400 font-normal">
                {' '}
                (optional)
              </span>
            </label>

            <textarea
              value={bio}
              onChange={(e) =>
                setBio(
                  e.target.value
                )}
              maxLength={150}
              rows={3}
              placeholder="Tell people a little about yourself..."
              className="w-full resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />

            <div className="text-right text-xs text-gray-400 mt-1">
              {bio.length}/150
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              uploading
            }
            className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? 'Saving...'
              : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}