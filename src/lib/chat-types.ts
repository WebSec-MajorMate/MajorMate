export type ChatMessage = {
  id: string;
  sequence: number;
  isRead: boolean;
  clientMessageId?: string;
  content: string;
  mine: boolean;
  createdAt: string;
};

export type ChatRoom = {
  id: string;
  nickname: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type ChatConversation = {
  nickname: string;
  canSend: boolean;
  olderCursor: number | null;
  readThrough: number | null;
  messages: ChatMessage[];
};

export type ChatFrame = {
  rooms: ChatRoom[];
  conversation: ChatConversation | null;
};
