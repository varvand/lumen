import { describe, expect, it } from 'vitest';
import { isPdfFile } from './pdfDrop';

describe('dropped PDFs', () => {
  it('accepts PDFs by type, or by name when the system gives no type', () => {
    expect(isPdfFile({ name: 'Lecture.pdf', type: 'application/pdf' })).toBe(true);
    expect(isPdfFile({ name: 'Lecture.PDF', type: '' })).toBe(true);
  });

  it('ignores other files', () => {
    expect(isPdfFile({ name: 'notes.md', type: 'text/markdown' })).toBe(false);
    expect(isPdfFile({ name: 'photo.png', type: 'image/png' })).toBe(false);
    expect(isPdfFile({ name: 'fake.pdf', type: 'image/png' })).toBe(false);
    expect(isPdfFile({ name: 'archive.zip', type: '' })).toBe(false);
  });
});
