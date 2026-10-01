# Firebase Chat App

A real-time chat application with Google OAuth authentication, built with Next.js 14, Firebase, and Tailwind CSS.

## Features

- 🔐 **Google OAuth** - Sign in with your Google account
- 💬 **Real-time messaging** - Instant message delivery with Firestore
- 🏠 **Multiple chat rooms** - Create and join different rooms
- 📱 **Responsive design** - Works on desktop and mobile
- 🎨 **Modern UI** - Clean interface with Tailwind CSS
- ⚡ **Real-time updates** - See new messages instantly

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Authentication:** Firebase Auth (Google provider)
- **Database:** Cloud Firestore
- **Styling:** Tailwind CSS
- **Language:** TypeScript

## Quick Start

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. **Authentication** → Sign-in method → Enable **Google**
4. **Firestore Database** → Create database → Start in **test mode**
5. **Project settings** → General → Your apps → Add Web app
6. Copy the Firebase config values

### 2. Configure Environment

```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local with your Firebase config
NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Install & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Firestore Security Rules (Important!)

After testing, update your Firestore rules in Firebase Console:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    // Rooms collection
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null 
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 50;
      allow update, delete: if request.auth.uid == resource.data.createdBy;

      // Messages subcollection
      match /messages/{messageId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null 
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.text is string
          && request.resource.data.text.size() <= 1000;
        allow update, delete: if false;
      }
    }
  }
}
```

## Project Structure

```
firebase-chat-app/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Landing page (login)
│   │   ├── layout.tsx        # Root layout
│   │   ├── globals.css       # Global styles
│   │   └── chat/
│   │       └── page.tsx      # Chat page
│   ├── components/
│   │   ├── AuthButton.tsx    # Google sign-in button
│   │   ├── ChatApp.tsx       # Main chat container
│   │   ├── ChatRoom.tsx      # Message list + input
│   │   └── Sidebar.tsx       # Room list + create room
│   ├── lib/
│   │   ├── firebase.ts       # Firebase initialization
│   │   └── auth.ts           # Auth helper functions
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── .env.example              # Environment template
├── .env.local                # Your Firebase config (create this)
├── package.json
└── README.md
```

## Deployment

### Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init

# Build and deploy
npm run build
firebase deploy
```

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

## Troubleshooting

**"Firebase: Error (auth/popup-blocked)"**
- Allow popups for localhost in your browser

**"Missing or insufficient permissions"**
- Check Firestore rules are set to test mode
- Verify you're signed in

**"Firebase App named '[DEFAULT]' already exists"**
- Already handled in `firebase.ts` with `getApps()` check

## License

MIT
