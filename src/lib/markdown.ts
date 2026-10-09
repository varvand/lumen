import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import type { Nodes, Parent, PhrasingContent, Root } from 'mdast';
import type { VFile } from 'vfile';
import { linkKey, linkLabel, WIKILINK } from './links';
import { isPdfTarget } from './pdf';

/** Whether a [[link]] target names an existing note, by its link key. */
export type LinkResolver = (key: string) => boolean;

/**
 * Turn [[Title|alias]] in text into links Lumen opens as notes, marking missing ones.
 * Links to PDFs open them beside the note; an embed, ![[File.pdf]], shows as a card.
 */
function remarkWikilinks() {
  return (tree: Root, file: VFile) => {
    const exists = file.data.linkExists as LinkResolver | undefined;
    const visit = (node: Nodes) => {
      if (node.type === 'link' || node.type === 'linkReference' || !('children' in node)) return;
      const parent = node as Parent;
      parent.children = (parent.children as Nodes[]).flatMap((child): Nodes[] => {
        if (child.type !== 'text') {
          visit(child);
          return [child];
        }
        const parts: PhrasingContent[] = [];
        let last = 0;
        for (const match of child.value.matchAll(WIKILINK)) {
          const [raw, target, alias] = match;
          const pdf = isPdfTarget(target);
          const embed = pdf && child.value[match.index - 1] === '!';
          const start = embed ? match.index - 1 : match.index;
          if (start > last) parts.push({ type: 'text', value: child.value.slice(last, start) });
          const missing = exists ? !exists(linkKey(target)) : false;
          const className = missing ? ['wikilink', 'wikilink-missing'] : ['wikilink'];
          if (pdf) className.push('pdf-link');
          if (embed) className.push('pdf-embed');
          parts.push({
            type: 'link',
            url: '#',
            title: missing
              ? pdf
                ? `${linkLabel(target)} is not in your library`
                : `Create “${linkLabel(target)}”`
              : null,
            data: { hProperties: { className, dataWikilink: target.trim() } },
            children: [{ type: 'text', value: linkLabel(target, alias) }],
          });
          last = match.index + raw.length;
        }
        if (!parts.length) return [child];
        if (last < child.value.length) parts.push({ type: 'text', value: child.value.slice(last) });
        return parts;
      }) as Parent['children'];
    };
    visit(tree);
  };
}

// Sanitize user Markdown before KaTeX adds its trusted rendering markup.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkWikilinks)
  .use(remarkRehype)
  .use(rehypeSanitize, {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      code: [['className', /^language-./, 'math-inline', 'math-display']],
      a: [
        ...(defaultSchema.attributes?.a || []).filter(
          (attribute) => !Array.isArray(attribute) || attribute[0] !== 'className',
        ),
        [
          'className',
          'data-footnote-backref',
          'wikilink',
          'wikilink-missing',
          'pdf-link',
          'pdf-embed',
        ],
        'dataWikilink',
      ],
    },
  })
  .use(rehypeKatex, { trust: false, strict: 'warn' })
  .use(rehypeStringify);

export function renderMarkdown(markdown: string, linkExists?: LinkResolver): string {
  return String(processor.processSync({ value: markdown, data: { linkExists } }));
}
export function parseImport(markdown: string, filename: string) {
  const clean = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = clean.match(/^#\s+(.+)\n*/);
  return {
    title: match?.[1]?.trim() || filename.replace(/\.(md|markdown)$/i, ''),
    body: match ? clean.slice(match[0].length) : clean,
  };
}
export function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
export function excerpt(body: string): string {
  return body
    .replace(/!\[\[/g, '[[')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/[#*_>`\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 130);
}
export function headings(body: string) {
  let fenced = false;
  return body.split('\n').flatMap((line) => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const match = !fenced && line.match(/^(#{1,3})\s+(.+)$/);
    return match ? [{ level: match[1].length, title: match[2] }] : [];
  });
}
