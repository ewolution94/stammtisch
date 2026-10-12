# Stammtisch

The classic card games for the afternoon meeting, at one table: Mau-Mau first, then Doppelkopf,
Skat and Durak. Unbranded, played on phones beside the call, with a German deck you handle (Eichel,
Grün, Herz, Schellen). Local only for now; the plan is `development/plans/card-games.md`.

## What's here so far

- **`server/core/`**: what every game shares. `cards.mjs` (card ids, decks, Augen, shuffling,
  dealing in packets), `tricks.mjs` (following and taking tricks from a game's own ranking).
- **`server/games/`**: one module per game, a pure state machine each: `deal()` makes a deal's
  state, `moves()` lists a seat's legal moves, `act()` makes one and returns the events for the
  table, `view()` is what one seat may see (never another hand). No I/O, no clock, no randomness of
  its own: a `randomInt` comes in, so tests deal fixed hands or pass a seeded one.
- **`server/bots/`**: a bot per game, deterministic, looking only at its own seat's view.

Card ids name the card the French way, whatever deck the page draws: `h-10`, `c-Q`, `d-A` (suits
c Kreuz/Eichel, s Pik/Grün, h Herz, d Karo/Schellen; J Bube/Unter, Q Dame/Ober, A Ass/Daus).

## The games

### Mau-Mau

2 to 6 players, 5 cards each, one Skat deck up to four, two from five. Match the top card's suit or
value, or draw one (a card that fits may go straight on). The house rules, with their defaults:
7 draws two, and a 7 on a 7 passes it on (on); 8 skips the next (on); the Unter goes on any card and
wishes a suit (on), but not on an Unter (off); the Daus plays again (off); the 9 reverses (off);
"Mau!" before the second-to-last card, or draw one (on); a point per deal won, or minus the cards
left in hand (Daus 11, 10, König 4, Ober 3, Unter 2, the rest their number).

## Commands

```bash
npm test
```
