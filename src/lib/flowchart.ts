/**
 * Flowcharts are written as ```mermaid fenced code blocks and drawn by Mermaid, which is
 * loaded the first time a note contains one so that startup and plain notes never pay for it.
 */

export const FLOWCHART_TEMPLATE = [
  '```mermaid',
  'flowchart TD',
  '    A[Start] --> B{Decision}',
  '    B -->|Yes| C[Do it]',
  '    B -->|No| D[Skip it]',
  '    C --> E[End]',
  '    D --> E',
  '```',
].join('\n');

/** Whether a fenced code block's info string asks for a diagram. */
export function isDiagramLanguage(info: string | null | undefined) {
  return (info ?? '').trim().split(/\s+/u)[0]?.toLowerCase() === 'mermaid';
}

export type DiagramResult = { svg: string; error?: undefined } | { svg?: undefined; error: string };

const COLOR = /^#[0-9a-f]{3,8}$/i;

/** Mermaid's colors, taken from the theme tokens in effect where the diagram is shown. */
function themeVariables(host: Element) {
  const style = getComputedStyle(host);
  const token = (name: string) => {
    const value = style.getPropertyValue(`--${name}`).trim();
    return COLOR.test(value) ? value : undefined;
  };
  const text = token('text');
  const accent = token('accent');
  const surface = token('surface');
  const background = token('background');
  const border = token('border');
  const variables: Record<string, string | boolean | undefined> = {
    darkMode: host.closest('[data-theme="dark"]') !== null,
    background,
    fontFamily: '"DM Sans Variable", sans-serif',
    primaryColor: token('accent-soft'),
    primaryTextColor: text,
    primaryBorderColor: accent,
    secondaryColor: surface,
    tertiaryColor: background,
    lineColor: token('secondary'),
    textColor: text,
    mainBkg: token('accent-soft'),
    nodeBorder: accent,
    clusterBkg: surface,
    clusterBorder: border,
    edgeLabelBackground: background,
    titleColor: text,
  };
  return Object.fromEntries(Object.entries(variables).filter(([, v]) => v !== undefined));
}

/**
 * Mermaid already sanitizes its output in strict mode; this is a second pass that drops
 * anything that could run script or load something, in case a label slips through.
 */
export function cleanSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg') return '';
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const name = element.localName.toLowerCase();
    if (['script', 'iframe', 'object', 'embed', 'foreignobject'].includes(name)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const value = attribute.value.trim();
      if (
        /^on/i.test(attribute.name) ||
        (/^(?:xlink:)?href$/i.test(attribute.name) && !value.startsWith('#'))
      )
        element.removeAttribute(attribute.name);
    }
  }
  return new XMLSerializer().serializeToString(root);
}

const cache = new Map<string, DiagramResult>();
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Draw a diagram as SVG, or say why it could not be drawn. Never throws. */
export function renderDiagram(source: string, host: Element): Promise<DiagramResult> {
  const variables = themeVariables(host);
  const key = `${JSON.stringify(variables)}\n${source}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  // Mermaid keeps global settings and scratch elements, so diagrams are drawn one at a time.
  const run = queue.then(async (): Promise<DiagramResult> => {
    try {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: 'base',
        themeVariables: variables,
        htmlLabels: false,
      });
      await mermaid.parse(source);
      const { svg } = await mermaid.render(`lumen-diagram-${++counter}`, source);
      const clean = cleanSvg(svg);
      if (!clean) return { error: 'The diagram could not be drawn.' };
      const result = { svg: clean };
      if (cache.size > 50) cache.delete(cache.keys().next().value!);
      cache.set(key, result);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message.split('\n')[0].slice(0, 200) || 'The diagram could not be drawn.' };
    }
  });
  queue = run;
  return run;
}

/** Fill an element with a diagram, or with a short message when its source is not valid. */
export async function mountDiagram(element: HTMLElement, source: string) {
  element.classList.add('diagram-pending');
  // Editor widgets are attached right after they are made; the theme is read from where they land.
  await Promise.resolve();
  const result = await renderDiagram(source, element);
  if (!element.isConnected) return;
  element.classList.remove('diagram-pending');
  element.classList.toggle('diagram-error', result.error !== undefined);
  if (result.svg) {
    const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement;
    element.replaceChildren(document.importNode(svg, true));
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', 'Flowchart');
  } else {
    const note = document.createElement('div');
    note.className = 'diagram-message';
    note.textContent = `Flowchart could not be drawn: ${result.error}`;
    const code = document.createElement('pre');
    code.textContent = source;
    element.replaceChildren(note, code);
  }
}
