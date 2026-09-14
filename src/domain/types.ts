import type { LanguageTag } from './languages.js';

export interface Member {
  id: string;
  name: string;
  language: LanguageTag;
  createdAt: string;
}

export interface Rendering {
  language: LanguageTag;
  text: string;
}

export interface Message {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  createdAt: string;
  readAt: string | null;
  /** As spoken, in the sender's own language. Never overwritten. */
  original: Rendering;
  /** Cached per-language renderings, including the original. */
  renderings: Rendering[];
}

export interface Household {
  id: string;
  members: Member[];
  messages: Message[];
}
