import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

// Sanitize user Markdown before KaTeX adds its trusted rendering markup.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeSanitize, {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      code: [['className', /^language-./, 'math-inline', 'math-display']],
    },
  })
  .use(rehypeKatex, { trust: false, strict: 'warn' })
  .use(rehypeStringify);

export function renderMarkdown(markdown: string): string {
  return String(processor.processSync(markdown));
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
