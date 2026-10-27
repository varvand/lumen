import { ViewPlugin, dropCursor, type ViewUpdate } from '@codemirror/view';

/** Whether a dropped or dragged file is a PDF, by type or, failing that, by name. */
export function isPdfFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));
}

/** Whether a drag in progress carries a PDF. Browsers only reveal types, not names, until the drop. */
function dragsPdf(transfer: DataTransfer | null) {
  return Array.from(transfer?.items ?? []).some(
    (item) => item.kind === 'file' && (item.type === 'application/pdf' || item.type === ''),
  );
}

/** Where PDFs were dropped. It follows the text as the note is edited while they are added. */
export interface DropPlace {
  pos: number;
  /** Stop following edits once the PDFs are in. */
  release(): void;
}

/**
 * Accept PDF files dropped onto the editor. The handler gets the PDFs and where they landed;
 * anything else dropped, including text dragged within the note, is left to the editor.
 */
export function pdfDrop(onDrop: (files: File[], place: DropPlace) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      places = new Set<DropPlace>();
      update(update: ViewUpdate) {
        if (update.docChanged)
          for (const place of this.places) place.pos = update.changes.mapPos(place.pos, 1);
      }
      destroy() {
        this.places.clear();
      }
    },
    {
      eventHandlers: {
        dragover(event, view) {
          if (!dragsPdf(event.dataTransfer)) return false;
          event.preventDefault();
          view.dom.classList.add('cm-pdf-drop');
          return false;
        },
        dragleave(event, view) {
          if (!view.dom.contains(event.relatedTarget as Node | null))
            view.dom.classList.remove('cm-pdf-drop');
          return false;
        },
        dragend(_event, view) {
          view.dom.classList.remove('cm-pdf-drop');
          return false;
        },
        drop(event, view) {
          view.dom.classList.remove('cm-pdf-drop');
          const pdfs = Array.from(event.dataTransfer?.files ?? []).filter(isPdfFile);
          if (!pdfs.length) return false;
          // A browser would otherwise navigate away to show the file.
          event.preventDefault();
          const places = this.places;
          const place: DropPlace = {
            pos:
              view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
              view.state.selection.main.head,
            release: () => places.delete(place),
          };
          places.add(place);
          onDrop(pdfs, place);
          return true;
        },
      },
    },
  );
  return [dropCursor(), plugin];
}
