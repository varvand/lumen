import { describe, expect, it } from 'vitest';
import { parseQuestions, questionPrompt } from './questions';

const note = { title: 'Photosynthesis', body: 'Plants turn light into chemical energy.' };

describe('Question prompt', () => {
  it('includes the note and only the activities the goal practices', () => {
    const remember = questionPrompt(note, 'remember');
    expect(remember).toContain('<note title="Photosynthesis">');
    expect(remember).toContain('Plants turn light into chemical energy.');
    expect(remember).toContain('"kind" is one of: "recall", "explain".');
    expect(remember).not.toContain('- apply:');
    expect(questionPrompt(note, 'apply')).toContain('"recall", "explain", "apply"');
  });
});

describe('Parsing questions', () => {
  it('reads a JSON array inside a code fence and text', () => {
    const reply =
      'Here you go:\n```json\n[{"kind": "explain", "question": " Why light? ", "answer": "Energy."}]\n```';
    const [prompt] = parseQuestions(reply, 'remember');
    expect(prompt).toMatchObject({ kind: 'explain', question: 'Why light?', answer: 'Energy.' });
    expect(prompt.id).toBeTruthy();
  });
  it('drops incomplete items and maps activities the goal does not practice', () => {
    const reply = JSON.stringify([
      { kind: 'apply', question: 'Design a greenhouse.', answer: 'More light.' },
      { kind: 'recall', question: 'No answer' },
      'not an object',
    ]);
    expect(parseQuestions(reply, 'remember')).toMatchObject([{ kind: 'recall' }]);
    expect(parseQuestions(reply, 'apply')).toMatchObject([{ kind: 'apply' }]);
  });
  it('explains replies without questions', () => {
    expect(() => parseQuestions('Sorry, I can’t.', 'remember')).toThrow('no questions');
    expect(() => parseQuestions('[{"kind": }]', 'remember')).toThrow('valid JSON');
    expect(() => parseQuestions('[]', 'remember')).toThrow('no questions');
  });
});
