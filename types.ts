
export interface AgentConfig {
  name: string;
  personality: string;
  voice: string;
  profilePic: string | null;
  background: string;
  blur: number;
  transparency: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  image?: string;
  audio?: string; // Menyimpan base64 audio data
  timestamp: number;
  parentId?: string | null; // ID pesan sebelumnya dalam rangkaian obrolan
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  activeMessageId: string | null; // Melacak ujung cabang aktif
  timestamp: number;
}

export interface CallHistory {
  id: string;
  timestamp: number;
  duration: string;
  status: 'missed' | 'completed';
}

export enum AppState {
  SETUP = 'setup',
  CHAT = 'chat',
  CALL = 'call'
}
