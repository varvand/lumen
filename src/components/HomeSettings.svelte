<script lang="ts">
  import { ArrowDown, ArrowUp, MagnifyingGlass, MapPin, X } from 'phosphor-svelte';
  import Modal from './Modal.svelte';
  import Select from './Select.svelte';
  import { home, SECTIONS, SECTION_LABELS, type Cover, type Section } from '../lib/home.svelte';
  import { findPlaces, type Place } from '../lib/weather';

  let { onclose }: { onclose: () => void } = $props();

  let query = $state('');
  let places = $state<Place[]>([]);
  let searching = $state(false);
  let searchError = $state('');
  let searched = $state(false);
  let controller: AbortController | undefined;
  async function search(event: SubmitEvent) {
    event.preventDefault();
    controller?.abort();
    controller = new AbortController();
    searching = true;
    searchError = '';
    try {
      places = await findPlaces(query, controller.signal);
      searched = true;
    } catch (e) {
      if (!controller.signal.aborted) searchError = e instanceof Error ? e.message : String(e);
    } finally {
      searching = false;
    }
  }
  function choose(place: Place) {
    home.set({ place });
    places = [];
    query = '';
    searched = false;
  }
  const placeLabel = (p: Place) => [p.name, p.region, p.country].filter(Boolean).join(', ');
  /** Shown sections first, in their order, then the hidden ones. */
  let ordered = $derived<Section[]>([
    ...home.sections,
    ...SECTIONS.filter((s) => !home.sections.includes(s)),
  ]);
</script>

<Modal title="Customize Home" {onclose}>
  <div class="settings-section">
    <h3>Greeting</h3>
    <label class="form-field"
      >Your name<input
        value={home.name}
        placeholder="What should Lumen call you?"
        autocomplete="given-name"
        oninput={(e) => home.set({ name: e.currentTarget.value.trimStart() })}
      /></label
    >
  </div>
  <div class="settings-section">
    <h3>Weather</h3>
    {#if home.place}
      <div class="home-place">
        <MapPin size={15} /><span>{placeLabel(home.place)}</span><button
          class="icon-button small"
          aria-label="Remove place"
          title="Remove place"
          onclick={() => home.set({ place: null })}><X size={13} /></button
        >
      </div>
    {/if}
    <form class="place-search" onsubmit={search}>
      <MagnifyingGlass size={15} /><input
        bind:value={query}
        placeholder={home.place ? 'Change place…' : 'Search for a city…'}
        aria-label="Search for a city"
        autocomplete="off"
      /><button class="secondary-button" disabled={!query.trim() || searching}
        >{searching ? 'Searching…' : 'Search'}</button
      >
    </form>
    {#if places.length}
      <ul class="place-results" aria-label="Places">
        {#each places as place (`${place.latitude},${place.longitude}`)}
          <li>
            <button onclick={() => choose(place)}><MapPin size={14} />{placeLabel(place)}</button>
          </li>
        {/each}
      </ul>
    {:else if searched}
      <p class="helper">No place by that name. Try a nearby city.</p>
    {/if}
    {#if searchError}<p role="alert" class="error-text">{searchError}</p>{/if}
    <div class="setting-row">
      <span class="setting-label">Temperature</span><Select
        label="Temperature"
        value={home.unit}
        onchange={(unit) => home.set({ unit })}
        options={[
          { value: 'celsius', label: 'Celsius · °C' },
          { value: 'fahrenheit', label: 'Fahrenheit · °F' },
        ]}
      />
    </div>
    <p class="helper">Forecasts come from Open-Meteo. Lumen sends it only the place you choose.</p>
  </div>
  <div class="settings-section">
    <h3>Layout</h3>
    <div class="setting-row">
      <span class="setting-label">Cover</span><Select
        label="Cover"
        value={home.cover}
        onchange={(cover: Cover) => home.set({ cover })}
        options={[
          { value: 'sky', label: 'Sky · follows the time of day' },
          { value: 'accent', label: 'Theme color' },
          { value: 'plain', label: 'None' },
        ]}
      />
    </div>
    <ul class="section-order" aria-label="Sections">
      {#each ordered as section (section)}
        {@const shown = home.shows(section)}
        {@const index = home.sections.indexOf(section)}
        <li class:hidden-section={!shown}>
          <label
            ><input
              type="checkbox"
              role="switch"
              checked={shown}
              onchange={(e) => home.toggleSection(section, e.currentTarget.checked)}
            />{SECTION_LABELS[section]}</label
          >
          <button
            class="icon-button small"
            aria-label={`Move ${SECTION_LABELS[section]} up`}
            disabled={!shown || index === 0}
            onclick={() => home.moveSection(section, -1)}><ArrowUp size={13} /></button
          ><button
            class="icon-button small"
            aria-label={`Move ${SECTION_LABELS[section]} down`}
            disabled={!shown || index === home.sections.length - 1}
            onclick={() => home.moveSection(section, 1)}><ArrowDown size={13} /></button
          >
        </li>
      {/each}
    </ul>
    <label class="setting-row"
      >Open Home when Lumen starts<input
        type="checkbox"
        role="switch"
        checked={home.startOnHome}
        onchange={(e) => home.set({ startOnHome: e.currentTarget.checked })}
      /></label
    >
    <button class="text-button" onclick={() => home.resetLayout()}
      >Restore the default layout</button
    >
  </div>
</Modal>
