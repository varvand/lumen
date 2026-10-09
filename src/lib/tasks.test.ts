import { describe, it, expect } from 'vitest';
import { localDate, noteTasks, tasksForToday, setTaskDone } from './tasks';
import { seedNotes } from './seeds';
import type { Note } from './types';

const today = '2026-10-09';

function note(id: string, body: string, patch: Partial<Note> = {}): Note {
  return { ...seedNotes()[0], id, title: id, body, trashed: false, updatedAt: 0, ...patch };
}

describe('Task items in notes', () => {
  it('finds bullet, numbered, checked, and indented tasks', () => {
    const body = [
      '# Plan',
      '- [ ] dash',
      '* [x] star',
      '+ [X] plus',
      '1. [ ] numbered',
      '2) [ ] paren',
      '    - [ ] **nested** `code`',
      '- [] not a task',
      '- plain item',
      '[ ] no bullet',
    ].join('\n');
    expect(
      noteTasks(note('a', body), today).map(({ line, text, done }) => [line, text, done]),
    ).toEqual([
      [1, 'dash', false],
      [2, 'star', true],
      [3, 'plus', true],
      [4, 'numbered', false],
      [5, 'paren', false],
      [6, '**nested** `code`', false],
    ]);
  });
  it('ignores tasks inside fenced code blocks', () => {
    const body = [
      '```md',
      '- [ ] in backticks',
      '```',
      '~~~',
      '- [ ] in tildes',
      '~~~',
      '- [ ] real',
    ].join('\n');
    expect(noteTasks(note('a', body), today).map((task) => [task.line, task.text])).toEqual([
      [6, 'real'],
    ]);
  });
  it('reads and strips each due-date marker', () => {
    const cases: [string, string, string][] = [
      ['- [ ] pay rent 📅 2026-10-01', 'pay rent', '2026-10-01'],
      ['- [ ] pay rent 📅2026-10-01 later', 'pay rent later', '2026-10-01'],
      ['- [ ] submit due: 2026-11-02', 'submit', '2026-11-02'],
      ['- [ ] submit DUE:2026-11-02', 'submit', '2026-11-02'],
      ['- [ ] call @today', 'call', today],
      ['- [ ] call @tomorrow please', 'call please', '2026-10-10'],
      ['- [ ] #today read chapter', 'read chapter', today],
    ];
    for (const [body, text, due] of cases)
      expect(noteTasks(note('a', body), today)[0]).toMatchObject({ text, due });
  });
  it('leaves look-alike words and tags alone', () => {
    const [task] = noteTasks(note('a', '- [ ] email@today.com #todays overdue: soon'), today);
    expect(task).toMatchObject({ text: 'email@today.com #todays overdue: soon' });
    expect(task.due).toBeUndefined();
  });
  it('rolls @tomorrow over month and year ends', () => {
    expect(noteTasks(note('a', '- [ ] x @tomorrow'), '2026-12-31')[0].due).toBe('2027-01-01');
  });
  it('formats local dates', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe("Today's tasks", () => {
  it('lists overdue tasks oldest first, then tasks due today and in the daily note', () => {
    const notes = [
      note('older', '- [ ] due today @today\n- [ ] later 📅 2026-12-01\n- [ ] no date', {
        updatedAt: 1,
      }),
      note(
        'newer',
        '- [ ] very late 📅 2026-09-01\n- [ ] late due: 2026-10-05\n- [ ] also today #today',
        {
          updatedAt: 2,
        },
      ),
      note('older-late', '- [ ] late too 📅 2026-10-05', { updatedAt: 1 }),
      note('daily', '- [ ] from daily\n- [x] finished @today', { title: today, updatedAt: 0 }),
    ];
    expect(tasksForToday(notes, today).map((task) => task.text)).toEqual([
      'very late',
      'late',
      'late too',
      'also today',
      'due today',
      'from daily',
    ]);
  });
  it('skips trashed notes, done tasks, and other days', () => {
    const notes = [
      note('trashed', '- [ ] gone @today', { trashed: true }),
      note('done', '- [x] done 📅 2026-10-01'),
      note('yesterday', '- [ ] old daily task', { title: '2026-10-08' }),
    ];
    expect(tasksForToday(notes, today)).toEqual([]);
  });
});

describe('Checking tasks off', () => {
  it('toggles only the checkbox, keeping indentation and the rest of the line', () => {
    const body = 'intro\n  1. [ ] **write** 📅 2026-10-09  \nend';
    const checked = setTaskDone(body, 1, true);
    expect(checked).toBe('intro\n  1. [x] **write** 📅 2026-10-09  \nend');
    expect(setTaskDone(checked, 1, false)).toBe(body);
    expect(noteTasks(note('a', checked), today)[0]).toMatchObject({ line: 1, done: true });
  });
  it('leaves non-task lines and fenced tasks unchanged', () => {
    const body = '- plain\n```\n- [ ] code\n```';
    for (const line of [0, 2, 9]) expect(setTaskDone(body, line, true)).toBe(body);
  });
});
