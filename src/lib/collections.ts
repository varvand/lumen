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

/** Siblings follow the saved order; folders not in it keep their alphabetical place after. */
export function orderFolders(folders: CollectionFolder[], order: string[]): CollectionFolder[] {
  const rank = new Map(order.map((path, index) => [path, index]));
  const position = (folder: CollectionFolder) => rank.get(folder.path) ?? Infinity;
  return [...folders]
    .sort((a, b) => position(a) - position(b) || a.name.localeCompare(b.name))
    .map((folder) => ({ ...folder, children: orderFolders(folder.children, order) }));
}

/** Move `path` before or after `target` among `siblings`, returning the new saved order. */
export function reorderFolders(
  order: string[],
  siblings: string[],
  path: string,
  target: string,
  after: boolean,
) {
  if (path === target || !siblings.includes(path) || !siblings.includes(target)) return order;
  const next = siblings.filter((item) => item !== path);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, path);
  return [...order.filter((item) => !siblings.includes(item)), ...next];
}

/** The collection a value has once folder `from` is renamed to `to`, keeping subfolders. */
export function renamedCollection(value: string, from: string, to: string) {
  const path = collectionPath(value);
  return inCollection(path, from) ? `${to}${path.slice(collectionPath(from).length)}` : value;
}
