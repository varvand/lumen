import type { Place, TemperatureUnit } from './weather';
import { localDate } from './tasks';

const KEY = 'lumen.home';

/** Sections of the Home screen, in the order they can appear. */
export const SECTIONS = ['today', 'weather', 'practice', 'recent'] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABELS: Record<Section, string> = {
  today: 'Today’s to-dos',
  weather: 'Weather',
  practice: 'Practice',
  recent: 'Jump back in',
};
/** How the band behind the greeting is painted. */
export type Cover = 'sky' | 'accent' | 'plain';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** Local date (YYYY-MM-DD) the to-do was checked off; it leaves Home the next day. */
  doneOn?: string;
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/** The Home screen's layout and to-dos, kept per device like other visual preferences. */
class Home {
  name = $state('');
  place = $state<Place | null>(null);
  unit = $state<TemperatureUnit>('celsius');
  cover = $state<Cover>('sky');
  /** Shown sections, in order. */
  sections = $state<Section[]>([...SECTIONS]);
  startOnHome = $state(true);
  todos = $state<Todo[]>([]);

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      this.name = typeof saved.name === 'string' ? saved.name : '';
      this.place =
        saved.place && typeof saved.place.latitude === 'number' ? (saved.place as Place) : null;
      this.unit = saved.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
      this.cover = ['sky', 'accent', 'plain'].includes(saved.cover) ? saved.cover : 'sky';
      if (Array.isArray(saved.sections))
        this.sections = strings(saved.sections).filter((s): s is Section =>
          (SECTIONS as readonly string[]).includes(s),
        );
      this.startOnHome = saved.startOnHome !== false;
      this.todos = Array.isArray(saved.todos)
        ? saved.todos.filter(
            (t: Todo) => t && typeof t.id === 'string' && typeof t.text === 'string',
          )
        : [];
    } catch {
      /* A broken Home layout falls back to the defaults; notes are never stored here. */
    }
  }
  #save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          name: this.name,
          place: this.place,
          unit: this.unit,
          cover: this.cover,
          sections: this.sections,
          startOnHome: this.startOnHome,
          todos: this.todos,
        }),
      );
    } catch {
      /* Changes still apply until the window closes. */
    }
  }
  set(patch: Partial<Pick<Home, 'name' | 'place' | 'unit' | 'cover' | 'startOnHome'>>) {
    Object.assign(this, patch);
    this.#save();
  }

  shows(section: Section) {
    return this.sections.includes(section);
  }
  toggleSection(section: Section, shown: boolean) {
    if (!shown) this.sections = this.sections.filter((s) => s !== section);
    else if (!this.shows(section)) this.sections = [...this.sections, section];
    this.#save();
  }
  /** Move a shown section up (-1) or down (1). */
  moveSection(section: Section, step: -1 | 1) {
    const from = this.sections.indexOf(section);
    const to = from + step;
    if (from < 0 || to < 0 || to >= this.sections.length) return;
    const next = [...this.sections];
    [next[from], next[to]] = [next[to], next[from]];
    this.sections = next;
    this.#save();
  }
  resetLayout() {
    this.sections = [...SECTIONS];
    this.cover = 'sky';
    this.#save();
  }

  /** Open to-dos, and the ones checked off today. */
  visibleTodos(today = localDate()) {
    return this.todos.filter((t) => !t.done || t.doneOn === today);
  }
  addTodo(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.todos = [
      ...this.todos,
      { id: crypto.randomUUID(), text: trimmed, done: false, createdAt: Date.now() },
    ];
    this.#save();
  }
  setTodoDone(id: string, done: boolean) {
    this.todos = this.todos.map((t) =>
      t.id === id ? { ...t, done, doneOn: done ? localDate() : undefined } : t,
    );
    this.#save();
  }
  removeTodo(id: string) {
    this.todos = this.todos.filter((t) => t.id !== id);
    this.#save();
  }
  /** Forget to-dos finished before today, so the list stays short. */
  tidy(today = localDate()) {
    const kept = this.todos.filter((t) => !t.done || t.doneOn === today);
    if (kept.length !== this.todos.length) {
      this.todos = kept;
      this.#save();
    }
  }
}

export const home = new Home();
