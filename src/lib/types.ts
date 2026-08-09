export interface User {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  model: string;
  created_at: string;
}

export interface Prompt {
  id: number;
  content: string;
  is_active: boolean;
  created_at: string;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachments: string[];
  created_at: string;
}

export interface ChatResponse {
  user_message: Message;
  assistant_message: Message;
}

export interface ProjectFile {
  id: number;
  filename: string;
  mime_type: string | null;
  created_at: string;
}
