export interface UserProfile {
  uid: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  photoURL: string | null;
  bio: string;
  verified: boolean;
  profileComplete: boolean;
  createdAt: any;
  lastSeen: any;
  online?: boolean;
}

export interface Conversation {
  id: string;
  participants: string[];

  participantData: {
    [uid: string]: {
      username: string;
      displayName: string;
      photoURL: string;
      verified: boolean;
    };
  };

  /*
   * Number of unread incoming messages for each
   * participant.
   *
   * Example:
   *
   * unreadCounts: {
   *   userA: 0,
   *   userB: 3
   * }
   */
  unreadCounts?: {
    [uid: string]: number;
  };

  lastMessage: {
    text: string;
    senderId: string;
    timestamp: any;
  } | null;

  updatedAt: any;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string | null;
  senderPhoto: string | null;
  timestamp: any;
  deliveredAt?: any;
  readAt?: any;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  createdAt?: any;
  createdBy?: string;
}