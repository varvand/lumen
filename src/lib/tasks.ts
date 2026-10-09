import type { Note } from './types';

export interface NoteTask {
  noteId: string;
  noteTitle: string;
  /** 0-based line index of the task in note.body */
  line: number;
  /** Task text with the checkbox and any date marker removed, trimmed; inline Markdown kept */
  text: string;
  done: boolean;
  /** Due date as local YYYY-MM-DD, if the task names one */
  due?: string;
}

/** `- [ ] text`, `* [x] text`, `1. [ ] text`, with any indentation. */
const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(\S.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const DATE = String.raw`(\d{4}-\d{2}-\d{2})`;
/** Each marker's first group is the date it names, if any; relative markers are resolved against today. */
const MARKERS: [RegExp, (today: string, date?: string) => string][] = [
  [new RegExp(String.raw`📅\s*${DATE}`, 'gu'), (_, date) => date!],
  [new RegExp(String.raw`(?<=^|\s)due:\s*${DATE}`, 'gi'), (_, date) => date!],
  [/(?<=^|\s)@today(?![\w-])()/gi, (today) => today],
  [/(?<=^|\s)@tomorrow(?![\w-])()/gi, (today) => addDays(today, 1)],
  [/(?<=^|\s)#today(?![\w/-])()/gi, (today) => today],
];

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function localDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number);
  return localDate(new Date(year, month - 1, date + days));
}

/** Strips every date marker; the earliest date named is the due date. */
function parseText(raw: string, today: string) {
  let text = raw;
  let due: string | undefined;
  for (const [pattern, dueOf] of MARKERS)
    text = text.replace(pattern, (_, date?: string) => {
      const day = dueOf(today, date || undefined);
      if (!due || day < due) due = day;
      return ' ';
    });
  return { text: text.replace(/\s{2,}/g, ' ').trim(), due };
}

/** Line indexes that sit inside fenced code blocks, fences included. */
function fencedLines(lines: string[]) {
  const fenced = new Set<number>();
  let open: string | undefined;
  lines.forEach((line, index) => {
    const fence = FENCE.exec(line)?.[1];
    if (open) {
      fenced.add(index);
      if (
        fence &&
        fence[0] === open[0] &&
        fence.length >= open.length &&
        !line.trim().slice(fence.length)
      )
        open = undefined;
    } else if (fence) {
      fenced.add(index);
      open = fence;
    }
  });
  return fenced;
}

/** All task items in a note, skipping fenced code blocks (``` and ~~~). */
export function noteTasks(note: Pick<Note, 'id' | 'title' | 'body'>, today = localDate()) {
  const lines = note.body.split('\n');
  const fenced = fencedLines(lines);
  const tasks: NoteTask[] = [];
  lines.forEach((line, index) => {
    if (fenced.has(index)) return;
    const match = TASK.exec(line.replace(/\r$/, ''));
    if (!match) return;
    const { text, due } = parseText(match[4], today);
    tasks.push({
      noteId: note.id,
      noteTitle: note.title,
      line: index,
      text,
      done: match[2] !== ' ',
      ...(due ? { due } : {}),
    });
  });
  return tasks;
}

/**
 * Open tasks for today's Home screen, from non-trashed notes: tasks due today or earlier (overdue),
 * and every open task in a daily note whose title is today's date (e.g. "2026-10-09").
 * Overdue first (oldest due first), then today's, ties by note updatedAt (newest first).
 */
export function tasksForToday(notes: Note[], today: string) {
  const picked: { task: NoteTask; overdue: boolean; updatedAt: number }[] = [];
  for (const note of notes) {
    if (note.trashed) continue;
    const daily = note.title.trim() === today;
    for (const task of noteTasks(note, today)) {
      if (task.done) continue;
      const overdue = !!task.due && task.due < today;
      if (overdue || task.due === today || daily)
        picked.push({ task, overdue, updatedAt: note.updatedAt });
    }
  }
  picked.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (a.overdue ? a.task.due!.localeCompare(b.task.due!) : 0) ||
      b.updatedAt - a.updatedAt ||
      a.task.noteId.localeCompare(b.task.noteId) ||
      a.task.line - b.task.line,
  );
  return picked.map(({ task }) => task);
}

/** Return the body with the task on that line checked or unchecked; the body unchanged if that line is not a task. */
export function setTaskDone(body: string, line: number, done: boolean) {
  const lines = body.split('\n');
  if (line < 0 || line >= lines.length || fencedLines(lines).has(line)) return body;
  const match = TASK.exec(lines[line].replace(/\r$/, ''));
  if (!match) return body;
  lines[line] = match[1] + (done ? 'x' : ' ') + lines[line].slice(match[1].length + 1);
  return lines.join('\n');
}
