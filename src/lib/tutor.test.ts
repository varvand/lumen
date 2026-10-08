import { describe, it, expect } from 'vitest';
import { tutorPrompt, type TutorCard } from './tutor';

const card: TutorCard = {
  note: { title: 'Photosynthesis', body: 'Plants turn light into chemical energy.' },
  prompt: { kind: 'explain', question: 'Why do plants need light?', answer: 'To make glucose.' },
  response: '',
  revealed: true,
};

describe('Tutor prompt', () => {
  it('includes the note, the card and the learner’s attempt', () => {
    const prompt = tutorPrompt({ ...card, response: 'For energy' }, [], 'What is ATP?');
    expect(prompt).toContain('<note title="Photosynthesis">');
    expect(prompt).toContain('Plants turn light into chemical energy.');
    expect(prompt).toContain('Suggested answer: To make glucose.');
    expect(prompt).toContain("Learner's attempt: For energy");
    expect(prompt.trimEnd().endsWith('Learner: What is ATP?')).toBe(true);
    expect(prompt).not.toContain('<conversation>');
  });
  it('marks a blank attempt and replays earlier turns', () => {
    const prompt = tutorPrompt(
      card,
      [
        { role: 'user', text: 'Explain it simpler' },
        { role: 'assistant', text: 'Light powers sugar-making.' },
      ],
      'And at night?',
    );
    expect(prompt).toContain("Learner's attempt: (left blank)");
    expect(prompt).toContain(
      '<conversation>\nLearner: Explain it simpler\n\nTutor: Light powers sugar-making.\n</conversation>',
    );
  });
  it('keeps the answer out until it is revealed', () => {
    const prompt = tutorPrompt({ ...card, revealed: false }, [], 'Hint?');
    expect(prompt).not.toContain('To make glucose.');
    expect(prompt).toContain('do not give away the full answer');
  });
  it('truncates very long notes', () => {
    const prompt = tutorPrompt(
      { ...card, note: { title: 'Long', body: 'x'.repeat(20_000) } },
      [],
      'Q',
    );
    expect(prompt).toContain('[… note truncated]');
    expect(prompt.length).toBeLessThan(13_500);
  });
});
