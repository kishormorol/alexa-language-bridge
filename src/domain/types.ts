import type { LanguageTag } from './languages.js';

/**
 * How someone writes their language. Plenty of people speak Bangla or Hindi but
 * type and read it in Latin letters — "bati", not "বাতি". Treating that as a
 * property of the person, rather than something to infer per message, is what
 * makes matching work: they can only recognise what they would have typed.
 */
export type Script = 'native' | 'latin';

export interface Member {
  id: string;
  name: string;
  language: LanguageTag;
  script: Script;
  createdAt: string;
}

export interface Rendering {
  language: LanguageTag;
  text: string;
}

/**
 * Anything a household member said, kept in the language they said it in, plus
 * cached renderings for whoever else needs to read it. This is the core primitive:
 * nothing in the house is stored "in English and translated for Ma" — it is stored
 * as spoken, and rendered for whoever is asking.
 */
export interface Utterance {
  original: Rendering;
  renderings: Rendering[];
}

export interface Message extends Utterance {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  createdAt: string;
  readAt: string | null;
}

export interface ListItem extends Utterance {
  id: string;
  addedByMemberId: string;
  addedAt: string;
  doneAt: string | null;
}

export interface Reminder extends Utterance {
  id: string;
  forMemberId: string;
  createdByMemberId: string;
  createdAt: string;
  dueAt: string;
  doneAt: string | null;
}

export type DeviceState = 'on' | 'off';

export interface Device {
  id: string;
  /** The name in the language of whoever registered it, plus renderings. */
  label: Utterance;
  room: string;
  state: DeviceState;
  changedAt: string;
  changedByMemberId: string | null;
}

export interface Household {
  id: string;
  members: Member[];
  messages: Message[];
  /** Keyed by list name, lowercased. "shopping" is the default. */
  lists: Record<string, ListItem[]>;
  reminders: Reminder[];
  devices: Device[];
}
