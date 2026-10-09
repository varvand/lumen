/** PDF.js, loaded the first time a PDF is opened or read, so notes never pay for it. */
import type { PDFDocumentProxy } from 'pdfjs-dist';

let loading: Promise<typeof import('pdfjs-dist')> | undefined;

export function pdfjs() {
  loading ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return loading;
}

/**
 * Image decoders and standard fonts, served by the app (see vite.config.ts). The worker
 * resolves URLs against its own script, so these must be absolute.
 */
const assets = () => new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href).href;

/** Open a PDF from its bytes. PDF.js takes ownership of the buffer, so it gets a copy. */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  return lib.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    wasmUrl: `${assets()}wasm/`,
    standardFontDataUrl: `${assets()}standard_fonts/`,
  }).promise;
}

/** The text of every page, with line breaks where the PDF ends a line. */
export async function pageTexts(doc: PDFDocumentProxy) {
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
        .join('')
        .trim(),
    );
    page.cleanup();
  }
  return pages;
}

/** Free a PDF's worker memory. */
export function closePdf(doc: PDFDocumentProxy | null | undefined) {
  if (doc) void doc.loadingTask.destroy();
}
