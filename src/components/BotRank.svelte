<!--
  A bot's rank as three small lozenges in the cards' gold, filled to its rank (the user, 2026-10-14:
  Apprentice, Journeyman, Master, as in a guild; Stichle's BotRank.svelte). In the lobby beside its
  name, in its sheet beside each rank, and on the desktop table's place cards. Not on the phone's
  (the user's decision for Stichle, 2026-10-15: ranks at the table only on a desktop table).
-->
<script lang="ts">
  import type { Level } from '../lib/api';
  import { t } from '../lib/i18n.svelte';

  let {
    level = 'journeyman',
    size = 7,
    decorative = false,
    label = '',
  }: { level?: Level; size?: number; decorative?: boolean; /** Read out instead of the rank (the rank's name beside it). */ label?: string } = $props();
  const n = $derived(level === 'apprentice' ? 1 : level === 'master' ? 3 : 2);
</script>

<!-- Beside the rank's name (`decorative`), the lozenges are only a picture of it. -->
<span class="pips" style:--pip="{size}px" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label || t(`level_${level}`)} aria-hidden={decorative ? 'true' : undefined}>
  {#each [1, 2, 3] as i (i)}<i class:on={i <= n}></i>{/each}
</span>

<style>
  .pips {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: calc(var(--pip) * 0.45);
    /* The cards' gold, a shade deeper: it sits on paper. */
    color: color-mix(in srgb, var(--gold) 70%, var(--gold-lo));
  }
  .pips i {
    width: var(--pip);
    height: var(--pip);
    rotate: 45deg;
    border-radius: calc(var(--pip) * 0.2);
    box-shadow: inset 0 0 0 calc(var(--pip) * 0.18) currentColor;
    opacity: 0.6;
  }
  .pips i.on {
    background: currentColor;
    opacity: 1;
  }
</style>
