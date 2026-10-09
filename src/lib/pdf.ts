/**
 * PDFs in notes. A note names a PDF by its file name, the way Obsidian does:
 * "[[Lecture 5.pdf]]", "[[Lecture 5.pdf#page=12]]", or an embed, "![[Lecture 5.pdf]]".
 */
import { linkKeys } from './links';
import type { Note, PdfText } from './types';

/** Whether a [[link]] target names a PDF rather than a note. */
export function isPdfTarget(target: string) {
  return /\.pdf$/i.test(target.split('#')[0].trim());
}

/** The PDF's file name in a link target, without folders or page. */
export function pdfName(target: string) {
  return target.split('#')[0].split('/').pop()!.trim();
}

/** The page a link points at, from "#page=12"; the first page otherwise. */
export function pdfPage(target: string) {
  const page = Number(target.match(/#page=(\d+)/i)?.[1]);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function pageLink(name: string, page: number) {
  return `[[${name}#page=${page}|${name.replace(/\.pdf$/i, '')}, p. ${page}]]`;
}

/** Text selected in a PDF as one paragraph: lines joined, words split by a hyphen rejoined. */
export function cleanSelection(text: string) {
  return text
    .replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A blockquote of selected text that links back to its page. */
export function quoteMarkdown(text: string, name: string, page: number) {
  return `> ${cleanSelection(text)}\n>\n> — ${pageLink(name, page)}`;
}

/** PDF file names a note links to or embeds, lowercased like link keys. */
export function pdfKeys(note: Pick<Note, 'id' | 'body'>) {
  return linkKeys(note).filter((key) => key.endsWith('.pdf'));
}

export interface PdfMatch {
  name: string;
  page: number;
  snippet: string;
}

/** Pages whose text contains the query, a few per PDF, with the words around each match. */
export function searchPdfs(texts: PdfText[], query: string, limit = 8, perPdf = 3) {
  const needle = query.trim().toLowerCase();
  const matches: PdfMatch[] = [];
  if (needle.length < 2) return matches;
  for (const text of texts) {
    let found = 0;
    for (let i = 0; i < text.pages.length && found < perPdf; i++) {
      const page = text.pages[i].replace(/\s+/g, ' ');
      const at = page.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      const start = Math.max(0, at - 40);
      const end = Math.min(page.length, at + needle.length + 60);
      matches.push({
        name: text.name,
        page: i + 1,
        snippet: `${start ? '…' : ''}${page.slice(start, end).trim()}${end < page.length ? '…' : ''}`,
      });
      found++;
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}
