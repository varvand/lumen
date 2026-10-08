import { Channel, invoke } from '@tauri-apps/api/core';
import { library } from './library.svelte';
import { native } from './storage';

const CHECK_EVERY = 6 * 60 * 60 * 1000;

interface Release {
  version: string;
  build: number;
  notes?: string | null;
}
type Progress =
  | { event: 'started'; total: number | null }
  | { event: 'progress'; downloaded: number }
  | { event: 'installing' };

export function formatRelease({ version, build }: Release) {
  return build ? `${version} (build ${build})` : version;
}

/**
 * Over-the-air updates from the latest main build. Only the desktop app updates; the browser
 * preview and `npm run desktop` dev builds never check, so a dev binary is never replaced.
 */
class Updates {
  readonly enabled = native && !import.meta.env.DEV;
  current = $state<Release | null>(null);
  available = $state<Release | null>(null);
  status = $state<'idle' | 'checking' | 'current' | 'downloading' | 'installing' | 'error'>('idle');
  /** Download progress from 0 to 1, or null while the size is unknown. */
  progress = $state<number | null>(null);
  error = $state('');
  private timer: ReturnType<typeof setInterval> | undefined;

  start() {
    if (!this.enabled) return;
    void invoke<Release>('app_version').then((v) => (this.current = v));
    void this.check(true);
    this.timer = setInterval(() => void this.check(true), CHECK_EVERY);
  }
  dispose() {
    clearInterval(this.timer);
  }
  /** Background checks stay quiet when offline; manual checks report errors. */
  async check(quiet = false) {
    if (!this.enabled || this.status === 'downloading' || this.status === 'installing') return;
    this.status = 'checking';
    this.error = '';
    try {
      this.available = await invoke<Release | null>('check_update');
      this.status = this.available ? 'idle' : 'current';
    } catch (e) {
      this.status = quiet ? 'idle' : 'error';
      this.error = String(e);
    }
  }
  async install() {
    if (!this.available) return;
    this.status = 'downloading';
    this.progress = null;
    this.error = '';
    let total: number | null = null;
    const channel = new Channel<Progress>();
    channel.onmessage = (message) => {
      if (message.event === 'started') total = message.total;
      else if (message.event === 'progress')
        this.progress = total ? message.downloaded / total : null;
      else this.status = 'installing';
    };
    try {
      // The app relaunches once installed, so make sure every edit is on disk first.
      await library.flush();
      await invoke('install_update', { onProgress: channel });
    } catch (e) {
      this.status = 'error';
      this.error = String(e);
      // The pending update was consumed; look again so the button can retry.
      await this.check(true);
      this.status = 'error';
    }
  }
}

export const updates = new Updates();
