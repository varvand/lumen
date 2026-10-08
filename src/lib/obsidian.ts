/**
 * Convert an Obsidian vault into Lumen notes.
 *
 * Folders become collections, properties and inline #tags become tags, and Obsidian-only
 * syntax (wikilinks, embeds, callouts, comments) becomes plain Markdown. Lumen has no
 * attachments yet, so images become a visible placeholder and are counted in the report.
 */
import type { Note } from './types';

export interface VaultFile {
  /** Path inside the vault, with forward slashes, e.g. "Physics/Waves.md". */
  path: string;
  text: string;
  created?: number;
  modified?: number;
}

export interface ImportPlan {
  notes: Note[];
  /** Markdown files that could not be converted, with the reason. */
  failed: { path: string; reason: string }[];
  /** Image and attachment references replaced with placeholders. */
  images: number;
}

const MAX_BODY = 2_000_000;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?|pdf|mp3|mp4|m4a|wav|webm|mov|ogg)$/i;

/** Lumen accepts letters, digits, "-" and "_" in ids, up to 128 characters. */
export async function noteId(vault: string, path: string) {
  const bytes = new TextEncoder().encode(`${vault}\n${path}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `obsidian-${hex.slice(0, 40)}`;
}

type Properties = Record<string, string | string[]>;

/** Read the YAML properties block Obsidian writes: scalars, [inline, lists], and "- item" lists. */
export function parseFrontmatter(text: string): { properties: Properties; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!match) return { properties: {}, body: text };
  const properties: Properties = {};
  let listKey = '';
  for (const line of match[1].split('\n')) {
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && listKey) {
      const list = properties[listKey];
      if (Array.isArray(list) && item[1].trim()) list.push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([^\s:#][^:]*):\s*(.*)$/);
    if (!pair) continue;
    const [, key, raw] = pair;
    const value = raw.trim();
    listKey = '';
    if (!value) {
      properties[key.trim()] = [];
      listKey = key.trim();
    } else if (value.startsWith('[') && value.endsWith(']')) {
      properties[key.trim()] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else {
      properties[key.trim()] = unquote(value);
    }
  }
  return { properties, body: text.slice(match[0].length) };
}
function unquote(value: string) {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** Apply a transform to prose only, leaving fenced and inline code untouched. */
function outsideCode(text: string, transform: (prose: string) => string) {
  return text
    .split(/(^```[\s\S]*?^```[ \t]*$|^~~~[\s\S]*?^~~~[ \t]*$)/m)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .split(/(`+[^`\n]*?`+)/)
            .map((piece, j) => (j % 2 ? piece : transform(piece)))
            .join(''),
    )
    .join('');
}

const linkText = (target: string, alias?: string) =>
  alias?.trim() || target.split('#')[0].split('/').pop()!.trim() || target.replace(/^#\^?/, '');

/** Turn Obsidian-only syntax into Markdown Lumen renders. */
export function convertBody(body: string, counts = { images: 0 }) {
  return outsideCode(body, (prose) =>
    prose
      // %%comments%% are hidden in Obsidian's reading view.
      .replace(/%%[\s\S]*?%%/g, '')
      // ![[embeds]]: attachments become placeholders, notes a pointer to the note.
      .replace(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, (_, target: string) => {
        const name = target.split('#')[0].trim();
        if (IMAGE.test(name)) {
          counts.images++;
          return `*(Attachment not imported: ${name.split('/').pop()})*`;
        }
        return `*(Embedded note: ${linkText(target)})*`;
      })
      // Markdown images pointing at vault files, not the web.
      .replace(/!\[([^\]]*)\]\((?!https?:|data:)([^)]+)\)/g, (_, alt: string, src: string) => {
        counts.images++;
        const name = decodeURIComponent(src.trim().split('/').pop() || src);
        return `*(Attachment not imported: ${alt.trim() || name})*`;
      })
      // [[wikilinks]] keep their visible text.
      .replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) =>
        linkText(target, alias),
      )
      // > [!type]+ Title  →  > **Type: Title**
      .replace(
        /^(>\s*)\[!(\w+)\][+-]?[ \t]*(.*)$/gm,
        (_, quote: string, type: string, title: string) => {
          const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
          return `${quote}**${title.trim() ? `${label}: ${title.trim()}` : label}**`;
        },
      )
      // ==highlights== have no Markdown equivalent; keep the emphasis.
      .replace(/==([^=\n]+)==/g, '**$1**'),
  );
}

/** Inline #tags in prose (not headings, code, or numbers like #1). */
export function inlineTags(body: string) {
  const tags: string[] = [];
  outsideCode(body, (prose) => {
    for (const m of prose.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu))
      tags.push(m[1]);
    return prose;
  });
  return tags;
}

function asList(value: string | string[] | undefined) {
  if (!value) return [];
  return (Array.isArray(value) ? value : value.split(/[,\s]+/)).filter(Boolean);
}

function collectionFor(vault: string, path: string) {
  const folders = path.split('/').slice(0, -1);
  return (folders.length ? folders.join(' / ') : vault).slice(0, 100);
}

function propertiesBlock(properties: Properties) {
  const lines = Object.entries(properties)
    .filter(([key]) => !['tags', 'tag', 'title'].includes(key.toLowerCase()))
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(', ') : value;
      return text ? `- **${key}:** ${convertBody(text)}` : '';
    })
    .filter(Boolean);
  return lines.length ? `\n\n---\n\n**Properties**\n\n${lines.join('\n')}\n` : '';
}

export async function convertNote(vault: string, file: VaultFile, counts = { images: 0 }) {
  const text = file.text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const { properties, body: raw } = parseFrontmatter(text);
  const fileTitle = file.path.split('/').pop()!.replace(/\.md$/i, '');
  const titleProperty = properties.title;
  const title = (typeof titleProperty === 'string' && titleProperty.trim()) || fileTitle;
  // Obsidian shows the file name as the title; drop a first heading that repeats it.
  const heading = raw.match(/^\s*#\s+(.+?)\s*#*\s*(?:\n+|$)/);
  const content = heading && heading[1].trim() === title ? raw.slice(heading[0].length) : raw;
  const body = (convertBody(content, counts).trim() + propertiesBlock(properties)).trim();

  const tags = [
    ...new Set(
      [...asList(properties.tags), ...asList(properties.tag), ...inlineTags(content)]
        .map((t) => t.replace(/^#/, '').trim())
        .filter((t) => t && t.length <= 80),
    ),
  ].slice(0, 20);
  const now = Date.now();
  return {
    id: await noteId(vault, file.path),
    title: title.replace(/[\r\n]+/g, ' ').slice(0, 500),
    body,
    collection: collectionFor(vault, file.path),
    tags,
    intent: 'reference',
    pinned: false,
    inbox: false,
    trashed: false,
    createdAt: file.created || file.modified || now,
    updatedAt: file.modified || now,
    revision: 0,
    prompts: [],
    source: `Obsidian: ${vault}/${file.path}`.slice(0, 2000),
  } satisfies Note;
}

/** Convert every Markdown file in a vault, skipping notes Lumen already imported. */
export async function planImport(
  vault: string,
  files: VaultFile[],
  existing: (id: string) => boolean = () => false,
): Promise<ImportPlan & { alreadyImported: number }> {
  const plan = { notes: [] as Note[], failed: [] as ImportPlan['failed'], images: 0 };
  let alreadyImported = 0;
  for (const file of files) {
    if (!/\.md$/i.test(file.path)) continue;
    try {
      // Count placeholders only for notes this import actually adds.
      const counts = { images: 0 };
      const note = await convertNote(vault, file, counts);
      if (existing(note.id)) alreadyImported++;
      else if (note.body.length > MAX_BODY)
        plan.failed.push({ path: file.path, reason: 'larger than 2 MB' });
      else {
        plan.notes.push(note);
        plan.images += counts.images;
      }
    } catch (e) {
      plan.failed.push({ path: file.path, reason: String(e) });
    }
  }
  return { ...plan, alreadyImported };
}

/** Folders Obsidian and other tools keep alongside notes, never imported. */
export function isHiddenPath(path: string) {
  return path.split('/').some((part) => part.startsWith('.') || part === 'node_modules');
}
