<!--
  How to play, as full-screen pages: Folio's <ewo-guide> brings the frame (swipe, the dots, Back and
  Next, Done), src/lib/guides.ts the pages, each drawn with the game's own cards (Stichle's guide, one
  per game here). The table's opens once on a device's first visit (Home); each game's from the start
  page, the lobby and Settings.
-->
<script lang="ts">
  import { GUIDES, type GuideId } from '../lib/guides';
  import { i18n, t } from '../lib/i18n.svelte';
  import { ui } from '../lib/ui.svelte';
  import Card from './Card.svelte';

  // The last guide shown stays drawn while it closes: the exit animation needs its pages.
  let last: GuideId = $state('table');
  $effect(() => {
    if (ui.guide) last = ui.guide;
  });
  const id = $derived(ui.guide ?? last);
  const pages = $derived(GUIDES[id]);
  const lang = $derived(i18n.lang);
  const close = () => (ui.guide = null);
</script>

<ewo-guide
  open={ui.guide !== null}
  label={id === 'table' ? t('guideTable') : t('guideOf', { game: t(`game_${id}`) })}
  next-label={t('guideNext')}
  back-label={t('guideBack')}
  skip-label={t('guideSkip')}
  done-label={t('guideDone')}
  oncancel={close}
  onclose={close}
>
  {#each pages as page, i (`${id}-${i}`)}
    <section class="page">
      <div class="art" aria-hidden="true">
        {#each page.cards as c, k (k)}
          <span class="c" class:small={c.small} class:win={c.win} class:dim={c.dim} style:--x="{c.x}px" style:--y="{c.y}px" style:--r="{c.r}deg">
            {#if c.back}<Card back />{:else}<Card id={c.id} />{/if}
          </span>
        {/each}
        {#if page.badge}<span class="badge display">{page.badge}</span>{/if}
        {#if page.tag}<span class="tag">{page.tag[lang]}</span>{/if}
      </div>
      <h2 class="display">{page.title[lang]}</h2>
      <p>{page.text[lang]}</p>
    </section>
  {/each}
</ewo-guide>

<style>
  /* The guide in the card table's room: dark wood, the text in the cloth's paper colour, the main
     button paper with the gold hairline, the dots gold (Stichle's). */
  ewo-guide {
    --ewo-guide-bg: radial-gradient(120% 70% at 50% 0%, #3a2015, #120a07 70%) #140b08;
    --ewo-guide-fg: var(--on-cloth);
    --ewo-guide-fg-2: var(--on-cloth-2);
    --ewo-guide-accent: var(--paper);
    --ewo-guide-accent-ink: var(--ink);
    /* With colour alone marking the page (Folio 8a5bd20: the dots are all one size), 0.5 gives about
       4.4:1 on the wood and 3.2:1 under the gold (0.28 was about 2.2:1). */
    --ewo-guide-dot: rgb(236 230 214 / 0.5);
    --ewo-guide-dot-on: var(--gold-hi);
  }
  ewo-guide::part(next) {
    box-shadow: inset 0 0 0 2px var(--paper), inset 0 0 0 3px var(--gold);
    font: 700 17px/1 var(--display);
    font-variant-numeric: lining-nums;
  }
  .page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 12px 28px 8px;
    text-align: center;
  }
  h2 {
    margin: 8px 0 0;
    font-size: 30px;
    line-height: 1.08;
    text-wrap: balance;
    color: var(--on-cloth);
  }
  p {
    margin: 0;
    max-width: 36ch;
    font-size: 16px;
    line-height: 1.5;
    color: var(--on-cloth-2);
    text-wrap: pretty;
  }

  /* The pictures: cards laid out from a centre point (--x, --y, --r), like on the table. */
  .art {
    position: relative;
    flex: none;
    width: min(100%, 320px);
    height: 220px;
  }
  .c {
    position: absolute;
    left: 50%;
    top: 46%;
    width: 88px;
    translate: calc(-50% + var(--x, 0px)) calc(-50% + var(--y, 0px));
    rotate: var(--r, 0deg);
    filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.5));
  }
  .c.small {
    width: 62px;
  }
  .c.win {
    filter: drop-shadow(0 0 10px rgb(243 220 148 / 0.75)) drop-shadow(0 10px 14px rgb(0 0 0 / 0.5));
  }
  .c.dim {
    filter: brightness(0.62) saturate(0.7) drop-shadow(0 10px 14px rgb(0 0 0 / 0.5));
  }
  .badge {
    position: absolute;
    right: 14px;
    top: 4px;
    display: grid;
    place-items: center;
    min-width: 56px;
    height: 56px;
    padding: 0 10px;
    border-radius: 999px;
    background: linear-gradient(var(--gold-hi), var(--gold));
    color: var(--ink);
    font-size: 24px;
    font-weight: 700;
    box-shadow: 0 0 0 2px var(--gold-lo), 0 8px 16px -6px rgb(0 0 0 / 0.6);
  }
  .tag {
    position: absolute;
    left: 50%;
    bottom: 2px;
    translate: -50% 0;
    max-width: 100%;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgb(18 11 7 / 0.72);
    color: var(--gold-hi);
    font: 700 14px/1.1 var(--display);
    font-variant-numeric: lining-nums;
    white-space: nowrap;
  }
</style>
