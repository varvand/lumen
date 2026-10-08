import { invoke } from '@tauri-apps/api/core';
import type { Note, Prompt } from './types';

/** Chat apps Lumen can ask through their signed-in command-line tool. */
export type Provider = 'claude' | 'codex';
export const PROVIDER_NAMES: Record<Provider, string> = { claude: 'Claude', codex: 'ChatGPT' };

export interface TutorMessage {
  role: 'user' | 'assistant';
  text: string;
  provider?: Provider;
}
export interface TutorCard {
  note: Pick<Note, 'title' | 'body'>;
  prompt: Pick<Prompt, 'kind' | 'question' | 'answer'>;
  response: string;
  /** Whether the learner has seen the suggested answer yet. */
  revealed: boolean;
}

/** Enough of the note for context without sending a whole book on every turn. */
const NOTE_LIMIT = 12_000;

/** One self-contained prompt: each answer is a fresh, stateless turn of the chat app. */
export function tutorPrompt(card: TutorCard, history: TutorMessage[], question: string) {
  const body =
    card.note.body.length > NOTE_LIMIT
      ? `${card.note.body.slice(0, NOTE_LIMIT)}\n\n[… note truncated]`
      : card.note.body;
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.text}`)
    .join('\n\n');
  return [
    'You are a patient tutor inside Lumen, a note-taking and spaced-practice app. The learner is',
    'reviewing a practice card and has a question about it. Explain clearly and concisely in',
    'Markdown, build on the note where you can, and say so when something goes beyond it or when',
    'the suggested answer looks wrong. Do not use tools or read files; answer from the context',
    'below and your own knowledge.',
    '',
    `<note title="${card.note.title.replace(/"/g, "'")}">`,
    body,
    '</note>',
    '',
    `<card kind="${card.prompt.kind}">`,
    `Question: ${card.prompt.question}`,
    ...(card.revealed
      ? [
          `Suggested answer: ${card.prompt.answer}`,
          `Learner's attempt: ${card.response.trim() || '(left blank)'}`,
        ]
      : [
          'The learner has not answered yet. Help them think it through with hints and',
          'explanation of the underlying ideas, but do not give away the full answer.',
        ]),
    '</card>',
    ...(transcript ? ['', '<conversation>', transcript, '</conversation>'] : []),
    '',
    `Learner: ${question}`,
  ].join('\n');
}

const KEY = 'lumen.tutor.provider';
const OPEN_KEY = 'lumen.tutor.open';
export const tutor = {
  get open() {
    try {
      return localStorage.getItem(OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  },
  set open(value: boolean) {
    try {
      localStorage.setItem(OPEN_KEY, String(value));
    } catch {
      /* A per-device convenience only. */
    }
  },
  providers: () => invoke<Provider[]>('assistant_providers'),
  ask: (provider: Provider, prompt: string) =>
    invoke<string>('ask_assistant', { provider, prompt }),
  preferred(available: Provider[]): Provider | undefined {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* Fall back to the first available app. */
    }
    return available.find((p) => p === saved) ?? available[0];
  },
  remember(provider: Provider) {
    try {
      localStorage.setItem(KEY, provider);
    } catch {
      /* A per-device convenience only. */
    }
  },
};
