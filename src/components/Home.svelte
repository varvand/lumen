<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowRight,
    ArrowUpRight,
    Brain,
    Check,
    Cloud,
    CloudFog,
    CloudLightning,
    CloudMoon,
    CloudRain,
    CloudSnow,
    CloudSun,
    Drop,
    MapPin,
    Moon,
    Plus,
    SlidersHorizontal,
    Sun,
    X,
  } from 'phosphor-svelte';
  import { home, type Section } from '../lib/home.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { excerpt } from '../lib/markdown';
  import { localDate, setTaskDone, tasksForToday, type NoteTask } from '../lib/tasks';
  import { describeWeather, forecast, type Forecast, type WeatherIcon } from '../lib/weather';
  import HomeSettings from './HomeSettings.svelte';

  const ICONS: Record<WeatherIcon, typeof Sun> = {
    sun: Sun,
    moon: Moon,
    'cloud-sun': CloudSun,
    'cloud-moon': CloudMoon,
    cloud: Cloud,
    fog: CloudFog,
    drizzle: CloudRain,
    rain: CloudRain,
    snow: CloudSnow,
    storm: CloudLightning,
  };

  /** The clock, updated every few seconds so the greeting and the day turn over by themselves. */
  let now = $state(new Date());
  let today = $derived(localDate(now));
  let hour = $derived(now.getHours());
  let period = $derived(
    hour < 5 ? 'night' : hour < 9 ? 'dawn' : hour < 17 ? 'day' : hour < 21 ? 'dusk' : 'night',
  );
  let weekday = $derived(now.toLocaleDateString(undefined, { weekday: 'long' }));
  let dateText = $derived(now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }));
  let clock = $derived(now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
  let customizing = $state(false);

  let weather = $state<Forecast | null>(null);
  let weatherError = $state('');
  $effect(() => {
    const place = home.place;
    const unit = home.unit;
    void hour; // Refresh with the hour; the forecast itself is cached.
    if (!place || !home.shows('weather')) {
      weather = null;
      return;
    }
    const controller = new AbortController();
    weatherError = '';
    forecast(place, unit, controller.signal)
      .then((result) => (weather = result))
      .catch((e) => {
        if (!controller.signal.aborted) weatherError = e instanceof Error ? e.message : String(e);
      });
    return () => controller.abort();
  });
  let sky = $derived(weather ? describeWeather(weather.code, weather.isDay) : null);
  let degree = $derived(home.unit === 'fahrenheit' ? '°F' : '°');
  let weatherLine = $derived(
    weather && sky && home.place && home.shows('weather')
      ? ` In ${home.place.name} it’s ${weather.temperature}${degree}, ${sky.label.toLowerCase()}.`
      : '',
  );

  /** Tasks checked off on Home stay listed, crossed out, until the screen closes. */
  let checked = $state<NoteTask[]>([]);
  const taskKey = (t: Pick<NoteTask, 'noteId' | 'line'>) => `${t.noteId}:${t.line}`;
  let noteTasks = $derived.by(() => {
    const open = tasksForToday(library.notes, today);
    const keys = new Set(open.map(taskKey));
    return [
      ...open.map((task) => ({ task, done: false })),
      ...checked.filter((t) => !keys.has(taskKey(t))).map((task) => ({ task, done: true })),
    ];
  });
  let todos = $derived(home.visibleTodos(today));
  let remaining = $derived(
    noteTasks.filter((t) => !t.done).length + todos.filter((t) => !t.done).length,
  );
  let draft = $state('');

  function setNoteTask(task: NoteTask, done: boolean) {
    const note = library.get(task.noteId);
    if (!note) return;
    const body = setTaskDone(note.body, task.line, done);
    if (body === note.body) return;
    library.change(note.id, { body });
    // Save now: nothing on Home waits for the editor's autosave. A failure shows the usual error.
    library.flush().catch(() => {});
    checked = done ? [...checked, task] : checked.filter((t) => taskKey(t) !== taskKey(task));
  }
  function addTodo(event: SubmitEvent) {
    event.preventDefault();
    home.addTodo(draft);
    draft = '';
  }
  /** Task text without the Markdown that would show as symbols in a one-line list. */
  const plain = (text: string) =>
    text
      .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, target, label) => label || target)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|~~|`)/g, '');
  const shortDate = (date: string) =>
    new Date(`${date}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  let recent = $derived(
    library.live
      .filter((n) => !n.inbox)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 4),
  );
  function ago(timestamp: number) {
    const minutes = Math.round((now.getTime() - timestamp) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return days === 1 ? 'Yesterday' : `${days} days ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  let dueNotes = $derived(new Set(library.due.map((q) => q.note.id)).size);

  onMount(() => {
    home.tidy();
    const timer = setInterval(() => (now = new Date()), 15_000);
    return () => clearInterval(timer);
  });
</script>

{#snippet section(name: Section)}
  {#if name === 'today'}
    <section class="home-card home-today" aria-labelledby="home-today-title">
      <header class="home-card-head">
        <h2 id="home-today-title">Today</h2>
        <span class="home-card-note"
          >{remaining
            ? `${remaining} to do`
            : noteTasks.length || todos.length
              ? 'All done'
              : ''}</span
        >
      </header>
      <ul class="todo-list">
        {#each noteTasks as { task, done } (taskKey(task))}
          <li class="todo" class:done>
            <button
              class="todo-check"
              role="checkbox"
              aria-checked={done}
              aria-label={plain(task.text)}
              onclick={() => setNoteTask(task, !done)}><Check size={11} weight="bold" /></button
            >
            <span class="todo-text">{plain(task.text)}</span>
            {#if task.due && task.due < today && !done}<span class="todo-due"
                >Since {shortDate(task.due)}</span
              >{/if}
            <button
              class="todo-source"
              title={`Open ${task.noteTitle}`}
              onclick={() => {
                const note = library.get(task.noteId);
                if (note) void ui.reveal(note);
              }}>{task.noteTitle}</button
            >
          </li>
        {/each}
        {#each todos as todo (todo.id)}
          <li class="todo" class:done={todo.done}>
            <button
              class="todo-check"
              role="checkbox"
              aria-checked={todo.done}
              aria-label={todo.text}
              onclick={() => home.setTodoDone(todo.id, !todo.done)}
              ><Check size={11} weight="bold" /></button
            >
            <span class="todo-text">{todo.text}</span>
            <button
              class="todo-remove"
              aria-label={`Remove ${todo.text}`}
              title="Remove"
              onclick={() => home.removeTodo(todo.id)}><X size={13} /></button
            >
          </li>
        {/each}
      </ul>
      <form class="todo-add" onsubmit={addTodo}>
        <Plus size={15} /><input
          bind:value={draft}
          placeholder="Add a to-do"
          aria-label="Add a to-do"
          autocomplete="off"
        />
      </form>
      {#if !noteTasks.length && !todos.length}
        <p class="home-hint">
          Tasks in your notes appear here when they’re due. Write <code>- [ ] Call Mia @today</code>
          or <code>📅 {today}</code> after a task.
        </p>
      {/if}
    </section>
  {:else if name === 'weather'}
    <section class="home-card home-weather" aria-labelledby="home-weather-title">
      <header class="home-card-head">
        <h2 id="home-weather-title">Weather</h2>
        {#if home.place}<span class="home-card-note"><MapPin size={12} />{home.place.name}</span
          >{/if}
      </header>
      {#if !home.place}
        <p class="home-empty">Add a place to see its forecast.</p>
        <button class="secondary-button" onclick={() => (customizing = true)}
          ><MapPin size={15} />Choose a place</button
        >
      {:else if weather && sky}
        {@const Icon = ICONS[sky.icon]}
        <div class="weather-now">
          <span class="weather-icon"><Icon size={40} weight="light" /></span>
          <span class="weather-temp">{weather.temperature}{degree}</span>
          <span class="weather-summary"
            >{sky.label}<small
              >H {weather.high}° · L {weather.low}° · <Drop
                size={11}
              />{weather.precipitation}%</small
            ></span
          >
        </div>
        <ol class="weather-hours" aria-label="Next hours">
          {#each weather.hours as slot (slot.time)}
            {@const HourIcon = ICONS[describeWeather(slot.code).icon]}
            <li>
              <span>{slot.time}</span><HourIcon size={18} weight="light" /><strong
                >{slot.temperature}°</strong
              >
            </li>
          {/each}
        </ol>
      {:else if weatherError}
        <p class="home-empty">{weatherError}</p>
      {:else}
        <div class="weather-loading" aria-label="Loading the forecast"></div>
      {/if}
    </section>
  {:else if name === 'practice'}
    <section class="home-card home-practice" aria-labelledby="home-practice-title">
      <header class="home-card-head">
        <h2 id="home-practice-title">Practice</h2>
        <Brain size={15} />
      </header>
      {#if library.due.length}
        <p class="practice-count">
          <strong>{library.due.length}</strong>
          {library.due.length === 1 ? 'question' : 'questions'} ready from {dueNotes}
          {dueNotes === 1 ? 'note' : 'notes'}
        </p>
        <button class="primary-button" onclick={() => ui.navigate('practice')}
          >Start practicing <ArrowRight size={16} /></button
        >
      {:else}
        <p class="practice-count"><strong>0</strong> due</p>
        <p class="home-empty">You’re up to date. Come back when a review is due.</p>
      {/if}
    </section>
  {:else if name === 'recent'}
    <section class="home-recent" aria-labelledby="home-recent-title">
      <header class="home-card-head">
        <h2 id="home-recent-title">Jump back in</h2>
        <button class="text-button" onclick={() => ui.browse('library')}
          >All notes <ArrowUpRight size={13} /></button
        >
      </header>
      <div class="recent-grid">
        {#each recent as note (note.id)}
          <button class="recent-card" onclick={() => ui.reveal(note)}>
            <span class="recent-collection">{note.collection || 'Notes'}</span>
            <strong>{note.title || 'Untitled note'}</strong>
            <span class="recent-excerpt">{excerpt(note.body) || 'A fresh page.'}</span>
            <span class="recent-time">{ago(note.updatedAt)}</span>
          </button>
        {:else}
          <p class="home-empty">Your recent notes will appear here.</p>
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

<div class="home-page">
  <div class={`home-cover cover-${home.cover} sky-${period}`} data-tauri-drag-region>
    <button class="home-customize" onclick={() => (customizing = true)}
      ><SlidersHorizontal size={15} />Customize</button
    >
  </div>
  <div class="home-inner">
    <header class="home-greeting">
      <p class="home-eyebrow">
        {clock}{#if home.place && home.shows('weather')}{` · ${home.place.name}`}{/if}
      </p>
      <h1>
        Hello{#if home.name}, <span class="home-name">{home.name}</span>{/if}.
      </h1>
      <p class="home-sentence">
        Today is {weekday}, {dateText}.{weatherLine}
        {#if !home.name}<button
            class="text-button accent inline"
            onclick={() => (customizing = true)}>Add your name</button
          >{/if}
      </p>
    </header>
    {#if home.sections.length}
      <div class="home-grid">
        {#each home.sections as name (name)}{@render section(name)}{/each}
      </div>
    {:else}
      <p class="home-empty home-blank">
        Every section is hidden. <button
          class="text-button accent inline"
          onclick={() => (customizing = true)}>Choose what Home shows</button
        >
      </p>
    {/if}
  </div>
</div>
{#if customizing}<HomeSettings onclose={() => (customizing = false)} />{/if}
