import { describe, expect, it } from 'vitest';
import { cosine, vectors, words } from './similarity';

describe('Note similarity', () => {
  it('keeps topic words and drops code, LaTeX, link targets and stop words', () => {
    expect(
      words('The **gradients** of $\\nabla L$ and [the docs](https://x.io/loss)\n```\nnoise\n```'),
    ).toEqual(['gradient', 'docs']);
  });

  it('scores notes about the same topic above unrelated ones', () => {
    const [a, b, c] = vectors([
      { title: 'Backpropagation', tags: [], body: 'gradient of the loss with the chain rule' },
      { title: 'Calculus for ML', tags: [], body: 'the chain rule and the gradient' },
      { title: 'Bread', tags: ['baking'], body: 'flour water salt loss of moisture' },
    ]);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
    expect(cosine(a, a)).toBeCloseTo(1);
  });
});
