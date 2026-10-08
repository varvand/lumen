import { describe, expect, it } from 'vitest';
import { collectionPath, collectionTree, inCollection } from './collections';

const note = (collection: string, patch = {}) => ({
  collection,
  inbox: false,
  trashed: false,
  ...patch,
});

describe('collection folders', () => {
  it('recognizes both imported and typed paths', () => {
    expect(collectionPath(' Physics/Waves / Interference ')).toBe('Physics / Waves / Interference');
    expect(inCollection('Physics/Waves', 'Physics / Waves')).toBe(true);
  });

  it('includes descendants without matching similarly named siblings', () => {
    expect(inCollection('Physics / Waves / Interference', 'Physics')).toBe(true);
    expect(inCollection('Physics / Waves', 'Physics / Wave')).toBe(false);
    expect(inCollection('Physics advanced', 'Physics')).toBe(false);
    expect(inCollection('Physics', 'Physics / Waves')).toBe(false);
  });

  it('infers missing parents and aggregates counts at every level', () => {
    expect(
      collectionTree([
        note('Physics/Waves/Interference'),
        note('Physics / Waves'),
        note('Physics'),
        note('Art'),
      ]),
    ).toEqual([
      { name: 'Art', path: 'Art', count: 1, children: [] },
      {
        name: 'Physics',
        path: 'Physics',
        count: 3,
        children: [
          {
            name: 'Waves',
            path: 'Physics / Waves',
            count: 2,
            children: [
              {
                name: 'Interference',
                path: 'Physics / Waves / Interference',
                count: 1,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('keeps identically named subfolders under their own parents', () => {
    const tree = collectionTree([note('Physics / Notes'), note('Art / Notes'), note('Art/Notes')]);
    expect(tree.map((folder) => folder.children[0].path)).toEqual([
      'Art / Notes',
      'Physics / Notes',
    ]);
    expect(tree[0].count).toBe(2);
  });

  it('omits inbox, trash, and unnamed collections', () => {
    expect(
      collectionTree([
        note('Inbox', { inbox: true }),
        note('Trash', { trashed: true }),
        note(''),
        note(' / '),
      ]),
    ).toEqual([]);
  });
});
