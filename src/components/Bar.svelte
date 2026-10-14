<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.svelte';
  import Logo from './Logo.svelte';
  import Settings from './Settings.svelte';

  let { code }: { code: string | null } = $props();

  let scrolled = $state(false);
  let settingsOpen = $state(false);
  let button: HTMLElement | undefined = $state();

  function closeSettings() {
    settingsOpen = false;
    // Focus goes back where it came from.
    button?.focus();
  }
  onMount(() => {
    const check = () => (scrolled = scrollY > 8);
    check();
    addEventListener('scroll', check, { passive: true });
    return () => removeEventListener('scroll', check);
  });
</script>

<header class="bar" class:scrolled>
  <a class="home" href="/" aria-label="Stammtisch"><Logo /></a>
  <div class="end">
    {#if code}
      <span class="code" aria-label="{t('code')} {code}">{code}</span>
    {/if}
    <!-- A real <button> sits inside the element: Enter and Space reach this handler as a click. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <ewo-settings-button bind:this={button} onclick={() => (settingsOpen = true)}></ewo-settings-button>
  </div>
</header>

<Settings open={settingsOpen} onclose={closeSettings} />

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: var(--bar-h);
    padding: 0 var(--gutter);
    background: color-mix(in oklab, var(--wood-2) 92%, transparent);
    border-bottom: 1px solid transparent;
    color: var(--on-cloth);
    --ewo-fg: var(--on-cloth);
    --ewo-fg-2: var(--on-cloth);
    --ewo-fill-2: rgb(255 255 255 / 0.1);
  }
  .bar.scrolled {
    border-bottom-color: rgb(236 230 214 / 0.16);
  }
  /* A flex box, so the logo is centred in the bar; as a line box it stood on its baseline, high. */
  .home {
    display: flex;
    text-decoration: none;
  }
  .end {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .code {
    padding: 5px 10px 4px;
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink);
    font: 600 13px/1 var(--ewo-mono);
    letter-spacing: 0.18em;
  }
</style>
