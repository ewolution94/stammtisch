<!--
  One card from the deck (src/lib/deck.js), as the page draws it: inline SVG, so its foil can move
  with a tilt and its words follow the language. `id` is the server's card id; none (or `back`) draws
  the back. The paper grain sits on top (main.ts makes it once). From Stichle's Card.svelte.
-->
<script lang="ts">
  import { card } from '../lib/deck';
  import { i18n } from '../lib/i18n.svelte';
  import { nextUid } from '../lib/table';

  let { id = null, back = false, glare = false }: { id?: string | null; back?: boolean; glare?: boolean } = $props();

  const uid = nextUid();
  const svg = $derived(card(back ? null : id, { lang: i18n.lang, uid }));
</script>

<div class="face">
  {@html svg}
  {#if glare}<div class="glare"></div>{/if}
</div>

<style>
  .face {
    position: relative;
    width: 100%;
    aspect-ratio: 5 / 7;
    border-radius: 5.6% / 4%;
    overflow: hidden;
    box-shadow: 0 1px 1px rgb(5 8 25 / 0.3), 0 8px 16px -8px rgb(5 8 25 / 0.6);
    -webkit-user-select: none;
    user-select: none;
  }
  .face :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .face::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--grain);
    background-size: 160px;
    mix-blend-mode: multiply;
    opacity: 0.5;
    pointer-events: none;
  }
  .glare {
    position: absolute;
    left: -50%;
    top: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.65), rgb(255 255 255 / 0) 30%);
    mix-blend-mode: soft-light;
    opacity: 0;
    pointer-events: none;
    will-change: transform, opacity;
  }
</style>
