import type { Intent, Note, Prompt, PromptKind } from './types';

/** Enough of the note to write questions from without sending a whole book. */
const NOTE_LIMIT = 16_000;
const MAX_QUESTIONS = 8;

/** The activities practice uses for each goal; only "Learn to apply" practices problems. */
export function kindsFor(intent: Intent): PromptKind[] {
  return intent === 'apply' ? ['recall', 'explain', 'apply'] : ['recall', 'explain'];
}

/** Ask for practice questions about a note as a JSON array, so any model can answer. */
export function questionPrompt(note: Pick<Note, 'title' | 'body'>, intent: Intent) {
  const body =
    note.body.length > NOTE_LIMIT
      ? `${note.body.slice(0, NOTE_LIMIT)}\n\n[… note truncated]`
      : note.body;
  const kinds = kindsFor(intent);
  return [
    'You write spaced-practice questions for Lumen, a note-taking and learning app. Read the',
    'note below and write 3 to 6 questions that check the ideas worth keeping from it.',
    '',
    'Activities:',
    '- recall: reconstruct a fact, definition or step from memory.',
    '- explain: say why or how something works, in your own words.',
    ...(kinds.includes('apply')
      ? ['- apply: use the idea in a new situation or small problem. Include at least one.']
      : []),
    '',
    'Each question stands on its own without the note. Each answer gives the key points to',
    'check, in a few sentences of Markdown; write math as $…$. Stay within the note, and do',
    'not use tools or read files.',
    '',
    `<note title="${note.title.replace(/"/g, "'")}">`,
    body,
    '</note>',
    '',
    'Reply with only a JSON array, no other text, like:',
    `[{"kind": "${kinds[0]}", "question": "…", "answer": "…"}]`,
    `"kind" is one of: ${kinds.map((k) => `"${k}"`).join(', ')}.`,
  ].join('\n');
}

/** Practice questions from a model's reply, tolerating code fences and text around the JSON. */
export function parseQuestions(reply: string, intent: Intent): Prompt[] {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('The reply had no questions in it.');
  let items: unknown;
  try {
    items = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error('The reply wasn’t valid JSON.');
  }
  if (!Array.isArray(items)) throw new Error('The reply had no questions in it.');
  const kinds = kindsFor(intent);
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const prompts = items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: crypto.randomUUID(),
      kind: kinds.find((k) => k === item.kind) ?? 'recall',
      question: text(item.question),
      answer: text(item.answer),
    }))
    .filter((p) => p.question && p.answer)
    .slice(0, MAX_QUESTIONS);
  if (!prompts.length) throw new Error('The reply had no questions in it.');
  return prompts;
}
