import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
export const MAX_NOTE_BYTES = 2_000_000;

/** Only raster data URLs may bypass the Markdown renderer's URL protocol filter. */
export function isEmbeddedImage(url: string) {
  return /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url);
}

function readImage(file: File): Promise<string> {
  if (!TYPES.has(file.type))
    return Promise.reject(new Error('Use a PNG, JPEG, GIF, WebP or AVIF image.'));
  if ((file.size * 4) / 3 > MAX_NOTE_BYTES)
    return Promise.reject(
      new Error('This image is too large. Use a smaller image (under 1.5 MB).'),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Read files while tracking the insertion position through intervening edits. */
export function imageInput(onerror: (message: string) => void) {
  return ViewPlugin.fromClass(
    class {
      pending = new Set<{ from: number; to: number }>();
      destroyed = false;
      constructor(readonly view: EditorView) {}
      update(update: ViewUpdate) {
        for (const position of this.pending) {
          position.from = update.changes.mapPos(position.from, 1);
          position.to = update.changes.mapPos(position.to, 1);
        }
      }
      destroy() {
        this.destroyed = true;
      }
      accept(event: ClipboardEvent | DragEvent) {
        const transfer = 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
        const files = Array.from(transfer?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (!files.length) return false;
        event.preventDefault();
        const selection = this.view.state.selection.main;
        const drop =
          event.type === 'drop'
            ? this.view.posAtCoords({
                x: (event as DragEvent).clientX,
                y: (event as DragEvent).clientY,
              })
            : null;
        const position = { from: drop ?? selection.from, to: drop ?? selection.to };
        this.pending.add(position);
        void Promise.all(
          files.map(async (file) => {
            const url = await readImage(file);
            const alt =
              file.name
                .replace(/\.[^.]+$/, '')
                .replace(/[\\[\]\r\n]/g, ' ')
                .trim() || 'Image';
            return `![${alt}](${url})`;
          }),
        )
          .then((images) => {
            if (this.destroyed) return;
            const insert = `\n\n${images.join('\n\n')}\n\n`;
            const { from, to } = position;
            const body = this.view.state.doc.toString();
            if (
              new TextEncoder().encode(body.slice(0, from) + insert + body.slice(to)).length >
              MAX_NOTE_BYTES
            )
              throw new Error(
                'This image would exceed the note’s 2 MB limit. Use a smaller image.',
              );
            this.pending.delete(position);
            this.view.dispatch({
              changes: { from, to, insert },
              selection: this.view.hasFocus ? { anchor: from + insert.length } : undefined,
              scrollIntoView: true,
              userEvent: 'input.paste',
            });
          })
          .catch((error) => {
            if (!this.destroyed) onerror(String(error instanceof Error ? error.message : error));
          })
          .finally(() => this.pending.delete(position));
        return true;
      }
    },
    {
      eventHandlers: {
        paste(event) {
          return this.accept(event);
        },
        drop(event) {
          return this.accept(event);
        },
        dragover(event) {
          if (
            !Array.from(event.dataTransfer?.items ?? []).some((item) =>
              item.type.startsWith('image/'),
            )
          )
            return false;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          return true;
        },
      },
    },
  );
}
