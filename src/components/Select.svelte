<script lang="ts" generics="T extends string">
  import { CaretDown, Check } from 'phosphor-svelte';

  let {
    value = $bindable<T>(),
    options,
    label,
    compact = false,
    class: className = '',
    disabled = false,
    onchange,
  }: {
    value: T;
    options: readonly { value: T; label: string }[];
    label: string;
    compact?: boolean;
    class?: string;
    disabled?: boolean;
    onchange?: (value: T) => void;
  } = $props();

  const id = $props.id();
  let trigger: HTMLButtonElement;
  let menu = $state<HTMLDivElement>();
  let open = $state(false);
  let active = $state(0);
  let search = '';
  let searchedAt = 0;
  const selected = $derived(options.find((option) => option.value === value));

  function show() {
    if (disabled || !options.length) return;
    trigger.focus();
    active = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    search = '';
    open = true;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    value = option.value;
    onchange?.(option.value);
    open = false;
    trigger.focus();
  }

  function keydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.isComposing) return;
    if (event.key === 'Tab') {
      open = false;
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      return;
    }
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        show();
        if (event.key === 'Home') active = 0;
        if (event.key === 'End') active = options.length - 1;
      } else if (event.key === 'Enter' || event.key === ' ') choose(active);
      else if (event.key === 'Home') active = 0;
      else if (event.key === 'End') active = options.length - 1;
      else
        active = Math.max(
          0,
          Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
        );
    } else if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      if (!open) show();
      const now = performance.now();
      search = (now - searchedAt < 700 ? search : '') + event.key.toLowerCase();
      searchedAt = now;
      const match = options.findIndex((option) => option.label.toLowerCase().startsWith(search));
      if (match >= 0) active = match;
    }
  }

  // Keep menus outside scrolling panels, while retaining theme tokens and modal focus scope.
  function mountMenu(element: HTMLDivElement) {
    const host = trigger.closest('dialog') ?? trigger.closest('.app-shell');
    host?.appendChild(element);
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    element.style.minWidth = `${Math.min(rect.width, window.innerWidth - margin * 2)}px`;
    element.style.maxWidth = `${window.innerWidth - margin * 2}px`;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const upward = element.offsetHeight > below && above > below;
    element.style.maxHeight = `${Math.max(0, upward ? above : below)}px`;
    const left = compact ? rect.right - element.offsetWidth : rect.left;
    element.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - element.offsetWidth - margin))}px`;
    element.style.top = `${upward ? rect.top - gap - element.offsetHeight : rect.bottom + gap}px`;

    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !trigger.contains(event.target) &&
        !element.contains(event.target)
      )
        open = false;
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && element.contains(event.target)) return;
      open = false;
    };
    const resize = () => (open = false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return {
      destroy() {
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('focusin', outside, true);
        document.removeEventListener('scroll', scroll, true);
        window.removeEventListener('resize', resize);
        element.remove();
      },
    };
  }

  $effect(() => {
    if (disabled) open = false;
  });
  $effect(() => {
    if (open) menu?.children[active]?.scrollIntoView({ block: 'nearest' });
  });
</script>

<button
  bind:this={trigger}
  type="button"
  class={`select-trigger ${compact ? 'compact' : 'select-input'} ${className}`}
  role="combobox"
  aria-label={label}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-controls={open ? `${id}-listbox` : undefined}
  aria-activedescendant={open ? `${id}-option-${active}` : undefined}
  {disabled}
  onclick={() => (open ? (open = false) : show())}
  onkeydown={keydown}
>
  <span class="select-value">{selected?.label ?? ''}</span><CaretDown size={compact ? 11 : 13} />
</button>
{#if open}
  <div
    bind:this={menu}
    use:mountMenu
    id={`${id}-listbox`}
    class="select-menu"
    role="listbox"
    tabindex="-1"
    aria-label={label}
    onpointerdown={(event) => event.preventDefault()}
    onkeydown={keydown}
  >
    {#each options as option, index (option.value)}
      <button
        type="button"
        id={`${id}-option-${index}`}
        role="option"
        aria-selected={option.value === value}
        class:active={index === active}
        tabindex="-1"
        onpointermove={() => (active = index)}
        onclick={() => choose(index)}
      >
        <span>{option.label}</span><span class="select-check"
          >{#if option.value === value}<Check size={14} />{/if}</span
        >
      </button>
    {/each}
  </div>
{/if}
