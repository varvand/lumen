import { describe, expect, it } from 'vitest';
import {
  convertBody,
  convertNote,
  inlineTags,
  isHiddenPath,
  noteId,
  parseFrontmatter,
  planImport,
} from './obsidian';

describe('Obsidian frontmatter', () => {
  it('reads scalars, inline lists, and dash lists', () => {
    const { properties, body } = parseFrontmatter(
      '---\ntitle: "Waves"\ntags: [physics, "optics"]\naliases:\n  - Wave basics\n  - Oscillation\nsource: https://example.com\n---\nBody',
    );
    expect(properties).toEqual({
      title: 'Waves',
      tags: ['physics', 'optics'],
      aliases: ['Wave basics', 'Oscillation'],
      source: 'https://example.com',
    });
    expect(body).toBe('Body');
  });

  it('leaves notes without properties untouched', () => {
    expect(parseFrontmatter('# Title\n---\ntext')).toEqual({
      properties: {},
      body: '# Title\n---\ntext',
    });
  });
});

describe('Obsidian syntax', () => {
  it('keeps [[links]] to notes and flattens links to attachments', () => {
    const links = 'See [[Wave equation]], [[Optics/Lenses|lenses]] and [[Note#Part]].';
    expect(convertBody(links)).toBe(links);
    expect(convertBody('Read [[paper.pdf|the paper]] and [[Scans/fig.png]].')).toBe(
      'Read the paper and fig.png.',
    );
  });

  it('replaces attachments and note embeds, and counts the attachments', () => {
    const counts = { images: 0 };
    const out = convertBody(
      '![[diagram.png|300]]\n![[Other note]]\n![alt text](assets/photo.jpg)\n![web](https://x.org/a.png)',
      counts,
    );
    expect(out).toBe(
      '*(Attachment not imported: diagram.png)*\n*(Embedded note: [[Other note]])*\n*(Attachment not imported: alt text)*\n![web](https://x.org/a.png)',
    );
    expect(counts.images).toBe(2);
  });

  it('converts callouts, highlights, and removes comments', () => {
    expect(convertBody('> [!tip]- Remember this\n> body\n\nA ==key== idea%%hidden%%.')).toBe(
      '> **Tip: Remember this**\n> body\n\nA **key** idea.',
    );
    expect(convertBody('> [!NOTE]\n> x')).toBe('> **Note**\n> x');
  });

  it('never rewrites code', () => {
    const code = '```md\n[[keep]] ==this== %%too%%\n```\nand `[[inline]]` but [[this]]';
    expect(convertBody(code)).toBe(
      '```md\n[[keep]] ==this== %%too%%\n```\nand `[[inline]]` but [[this]]',
    );
  });

  it('finds inline tags but not headings, numbers, or code', () => {
    expect(
      inlineTags('# Heading\nLearn #physics and #area/sub-topic (#idea).\nIssue #42 `#code`'),
    ).toEqual(['physics', 'area/sub-topic', 'idea']);
  });
});

describe('Obsidian notes', () => {
  it('maps folders, title, tags, properties, and dates', async () => {
    const note = await convertNote('Vault', {
      path: 'Physics/Waves/Interference.md',
      text: '---\ntags: [physics]\naliases: [Superposition]\n---\n# Interference\n\nWaves add up. #waves #physics',
      created: 1000,
      modified: 2000,
    });
    expect(note).toMatchObject({
      title: 'Interference',
      collection: 'Physics / Waves',
      tags: ['physics', 'waves'],
      inbox: false,
      intent: 'reference',
      createdAt: 1000,
      updatedAt: 2000,
      source: 'Obsidian: Vault/Physics/Waves/Interference.md',
    });
    expect(note.body).toBe(
      'Waves add up. #waves #physics\n\n---\n\n**Properties**\n\n- **aliases:** Superposition',
    );
    expect(note.id).toMatch(/^obsidian-[0-9a-f]{40}$/);
  });

  it('puts root notes in a collection named after the vault and keeps a different first heading', async () => {
    const note = await convertNote('My Vault', {
      path: 'Inbox idea.md',
      text: '# Something else\nText',
    });
    expect(note.collection).toBe('My Vault');
    expect(note.title).toBe('Inbox idea');
    expect(note.body).toBe('# Something else\nText');
  });

  it('uses the title property and normalizes Windows line endings', async () => {
    const note = await convertNote('V', {
      path: 'a.md',
      text: '---\r\ntitle: Real title\r\n---\r\nLine',
    });
    expect(note.title).toBe('Real title');
    expect(note.body).toBe('Line');
  });

  it('gives each vault path a stable id', async () => {
    expect(await noteId('V', 'a.md')).toBe(await noteId('V', 'a.md'));
    expect(await noteId('V', 'a.md')).not.toBe(await noteId('W', 'a.md'));
    expect(await noteId('V', 'a.md')).not.toBe(await noteId('V', 'b.md'));
  });
});

describe('Obsidian import plan', () => {
  it('skips non-Markdown files and notes imported before', async () => {
    const files = [
      { path: 'a.md', text: 'A ![[x.png]]' },
      { path: 'b.md', text: 'B ![[y.png]]' },
      { path: 'image.png', text: '' },
    ];
    const first = await planImport('V', files);
    expect(first.notes.map((n) => n.title)).toEqual(['a', 'b']);
    expect(first.images).toBe(2);

    const known = new Set([first.notes[0].id]);
    const second = await planImport('V', files, (id) => known.has(id));
    expect(second.notes.map((n) => n.title)).toEqual(['b']);
    expect(second.alreadyImported).toBe(1);
    expect(second.images).toBe(1);
  });

  it('reports notes that are too large', async () => {
    const plan = await planImport('V', [{ path: 'big.md', text: 'x'.repeat(2_000_001) }]);
    expect(plan.notes).toHaveLength(0);
    expect(plan.failed).toEqual([{ path: 'big.md', reason: 'larger than 2 MB' }]);
  });

  it('recognizes folders that are never imported', () => {
    expect(isHiddenPath('.obsidian/app.json')).toBe(true);
    expect(isHiddenPath('.trash/old.md')).toBe(true);
    expect(isHiddenPath('Notes/.hidden/x.md')).toBe(true);
    expect(isHiddenPath('Notes/visible.md')).toBe(false);
  });
});
