import type { Note } from './types';

export interface CollectionFolder {
  name: string;
  path: string;
  count: number;
  children: CollectionFolder[];
}

/** Slash-separated paths also recognize the folders supplied by Obsidian imports. */
export function collectionPath(value: string) {
  return value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ');
}

export function inCollection(value: string, folder: string) {
  const path = collectionPath(value);
  const parent = collectionPath(folder);
  return path === parent || path.startsWith(`${parent} / `);
}

/** Parent folders are inferred without rewriting existing notes or their collection names. */
export function collectionTree(notes: Pick<Note, 'collection' | 'inbox' | 'trashed'>[]) {
  const roots: CollectionFolder[] = [];
  const folders = new Map<string, CollectionFolder>();
  for (const note of notes) {
    if (note.inbox || note.trashed) continue;
    const path = collectionPath(note.collection);
    if (!path) continue;
    let children = roots;
    let parent = '';
    for (const name of path.split(' / ')) {
      parent = parent ? `${parent} / ${name}` : name;
      let folder = folders.get(parent);
      if (!folder) {
        folder = { name, path: parent, count: 0, children: [] };
        folders.set(parent, folder);
        children.push(folder);
      }
      folder.count++;
      children = folder.children;
    }
  }
  function sort(children: CollectionFolder[]) {
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of children) sort(folder.children);
  }
  sort(roots);
  return roots;
}
