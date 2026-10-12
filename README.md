# Stammtisch

The classic card games for the afternoon meeting, at one table: Mau-Mau, Doppelkopf and Skat so
far, Durak next. Unbranded, played on phones beside the call, with a German deck you handle (Eichel,
Grün, Herz, Schellen). Local only for now; the plan is `development/plans/card-games.md`.

## What's here so far

- **`server/core/`**: what every game shares. `cards.mjs` (card ids, decks, Augen, shuffling,
  dealing in packets), `tricks.mjs` (following and taking tricks from a game's own ranking).
- **`server/games/`**: one module per game, a pure state machine each: `deal()` makes a deal's
  state, `moves()` lists a seat's legal moves, `act()` makes one and returns the events for the
  table, `view()` is what one seat may see (never another hand). No I/O, no clock, no randomness of
  its own: a `randomInt` comes in, so tests deal fixed hands or pass a seeded one.
- **`server/bots/`**: a bot per game, deterministic, looking only at its own seat's view.
- **`server/core/match.mjs`**: deals in a row at one table: whose deal it is, who sits out (more
  people than the game takes: the dealer first), the running totals. A game adds its own match rules
  through hooks (Doppelkopf: the duty solo and Bock rounds).

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

### Doppelkopf

Four at the table, 48 cards (twice 9 to Ass), 12 each. The default is the DDV's tournament rules
(Turnierspielregeln, as of 2026-02-21), as `server/games/doppelkopf.mjs` has them:

- **Trumps:** the Dullen (♥10), the Ober ♣ ♠ ♥ ♦, the Unter the same, then Karo Ass, Zehn, König,
  Neun (26). Plain suits Ass, Zehn, König, Neun (Herz without its Zehn). Of two equal cards the
  first wins, the Dullen too.
- **Reservations,** asked round once from the dealer's left ("gesund" or not): a solo beats a
  wedding; of two solos the one nearer the dealer's left plays; a compulsory solo beats a lust solo.
  The dealer's left leads, except in a compulsory solo (the soloist).
- **Solos:** Damen (only the Ober), Buben (only the Unter), the four suits (the suit takes Karo's
  place; Herz keeps its Dulle on top, 24 trumps), the Fleischlose (no trump). In the Damen-, Buben-
  and the Fleischlose the ♥10 is a plain heart.
- **Wedding:** both ♣Q, announced: the first other player to take one of the first three tricks is
  the partner; nobody does, and it's a Karo solo. Kept quiet, a silent wedding: scored as a solo.
- **Announcements,** any time once the asking is over, by cards still held: Re/Kontra with 11,
  keine 90 with 10, 60 with 9, 30 with 8, schwarz with 7; a level may be skipped while the lowest
  skipped one is on time. The other side may answer Re/Kontra with one card fewer than the
  announcement it answers needed, but then makes no Absagen. In a wedding nothing before the partner
  is found, then every deadline a card earlier per trick it took.
- **Winning:** Re 121, Kontra 120 (only Kontra announced: Re 120, Kontra 121); an Absage means the
  other side must stay under 90/60/30 or take no trick, and its opponents win by reaching that. Both
  miss their Absage: nobody wins.
- **Scoring:** won 1; the losers under 90, 60, 30, schwarz 1 each; Re and Kontra 2 each; every Absage
  1; 120 against keine 90 (90 against 60, 60 against 30, 30 against schwarz) 1 each. Extra points in
  normal games only: gegen die Alten, each Doppelkopf (a trick of 40 Augen or more), each fox caught
  (♦A), the Karlchen (♣J takes the last trick), netted between the parties. Each winner plus, each
  loser minus; a soloist three times.
- **House rules,** off by default: without the nines (40 cards, 10 each); the second Dulle beats
  the first (always, or except in the last trick); Schweinchen (both ♦A in one hand rank on top);
  poverty (three trumps or fewer go across to whoever takes them, who gives three back; nobody takes:
  deal again); throwing in (five nines or five kings); the duty solo (everyone owes one solo a match;
  it doesn't use up a deal; whoever still owes one at the end is forced to play it); Bock rounds (after
  120 : 120, or Re and Kontra both said, the next round of deals counts double).
- **At the table:** four play; from five the dealer sits out (with six, the seat before them too).

### Skat

Three play (with four the dealer sits out), 32 cards, ten each and two in the Skat. The rules are the
Internationale Skatordnung (ISkO, November 2022), as `server/games/skat.mjs` has them:

- **Bidding:** Mittelhand says to Vorhand, then Hinterhand to whoever is left; only the one saying
  may jump, the one listening holds or passes. Nobody bids: Vorhand may play at 18, or the game is
  passed in (it counts in the list, and the next player deals). The 63 values from 18 to 264.
- **The games:** Karo 9, Herz 10, Pik 11, Kreuz 12, Grand 24, times the matadors (with or without,
  the Skat counted, Hand games too) plus Spiel, Hand, Schneider, Schneider announced, Schwarz,
  Schwarz announced, Ouvert. Null 23, Null Hand 35, Null Ouvert 46, Null Ouvert Hand 59.
  Announcements only with Hand; Ouvert in a suit or Grand game means everything announced.
- **Winning:** 61 Augen, the Skat counted for the declarer. Schneider is a side with 30 or less, the
  declarer too; Schwarz a side with no trick (the Skat is no trick). An announced level counts
  whether made or not, none counts twice. Null is lost with the declarer's first trick.
- **Overbid:** lost, at the bid rounded up to the game's next multiple. A Null worth less than the
  bid is lost the moment it's declared, as the cheapest suit or Grand game that reaches the bid.
- **Scoring:** a won game its value, a lost one twice that, minus (`plain`, the default); or the
  ISkO's list (`list`): +50 a won game, −50 a lost one, and each other player at the table 40 (at
  three) or 30 (at four, the dealer too) for each game the declarer loses.
- **House rules** (not in the ISkO), off by default: Ramsch when everyone passes (only the Unter
  trump, the most Augen lose them with the Skat, a Jungfrau doubles, a Durchmarsch wins 120);
  Kontra and Re (a defender before their first card, the declarer's answer at once; each doubles
  the score, not the value checked against the bid, and leaves the list's 50 and 40/30 as they are);
  Bock rounds (after 60 : 60, or Kontra and Re both said, the next round counts double).

## Commands

```bash
npm test
```
