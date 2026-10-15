# Stammtisch

The classic card games for the afternoon meeting, at one table: Mau-Mau, Doppelkopf, Skat and
Durak. Unbranded, played on phones beside the call, with a German deck you handle (Eichel, Grün,
Herz, Schellen; the Unter, Ober and König as paper cuts, the numbers in letterpress). The plan is
`development/plans/card-games.md` in the workspace.

- **Set a table, share the link.** A table gets a four-letter code and a link like
  `…/KXPT`, with a QR code. No accounts: a name and a seal are enough, and a reload puts you back in
  your chair with your hand.
- **Pick the game in the lobby,** with the rounds (everyone deals once a round), a clock per move if
  wanted, and the game's house rules (each game's defaults are the official rules, or the user's
  picks). Bots fill the empty chairs; with more at the table than the game takes, the dealer sits
  out.
- **Bots in three ranks** (the user's pick, 2026-10-14, as in Stichle): Lehrling, Geselle, Meister
  (Apprentice, Journeyman, Master; Mau-Mau the first two). The lobby's "Bots" sets every bot's rank,
  each new one's and the stand-ins' for anyone away; a bot's sheet sets its own. Each bot's
  temperament comes with its name (cautious, steady, bold) and leans what it dares: a solo, an
  announcement, a Skat bid. The rank shows in the lobby and in the bot's sheet, not on the phone's
  place cards (the user, 2026-10-15).
- **Where the others sit** (Settings → Players, kept on the device; the user's picks B and C,
  2026-10-15, as in Stichle): round the table, each place card on the rail where its player sits
  (the default; `src/lib/table.ts` → `seatSpots`), or on a board above the cloth, everyone in playing
  order, you last.
- **Cards you handle,** Folio's card kit (from Stichle): your hand is a fan; drag a card up or flick
  it, or tap it twice; a card you may not play shakes and drops back; hold one to look at it big (it
  tilts with the phone). Picking several cards (the Skat to put back, poverty's three) is tapping
  them.
- **How to play:** full-screen pages (Folio's `<ewo-guide>`) for the table and for each game, drawn
  with the game's own cards (`src/lib/guides.ts`). The table's opens once on a device's first
  visit; each game's from the start page, the lobby and Settings.
- **After each deal** its result in the game's own words, everyone's points, then the next deal once
  everyone has tapped on. The score sheet is a tap away; at the end the totals and their lines.

## What's here

- **`server/core/`**: what every game shares. `cards.mjs` (card ids, decks, Augen, shuffling,
  dealing in packets), `tricks.mjs` (following and taking tricks from a game's own ranking),
  `match.mjs` (deals in a row at one table: whose deal, who sits out, the totals; a game adds its
  own match rules through hooks).
- **`server/games/`**: one module per game, a pure state machine each: `deal()` makes a deal's
  state, `moves()` lists a seat's legal moves, `act()` makes one and returns the events for the
  table, `view()` is what one seat may see (never another hand). No I/O, no clock, no randomness of
  its own. `index.mjs` lists them with their bots.
- **`server/bots/`**: a bot per game in its ranks, deterministic, looking only at what its own seat
  sees. `rank.mjs` holds what they share: the ranks, the seeded draws, the master's search (it deals
  out the unseen cards many ways that fit what its seat has seen, plays each choice to the end with
  the journeyman's rules, and keeps a hard 150 ms stop). `tests/bots.test.mjs` shuffles everything a
  seat can't see and expects the same move from every rank.
- **`server/rooms.mjs`**: the rooms (adapted from Stichle's `game.mjs`): codes, seats, the host,
  the lobby's settings, a game played deal after deal through the match, the clock per move, bots and
  the absent, one view per page. `api.mjs` (JSON moves, SSE views), `server.mjs` (the production
  server, no dependencies).
- **`src/`**: the page (Svelte 5), adapted from Stichle's: `lib/deck.js` (the German deck, drawn in
  code), `components/MauTable`, `TrickTable` (Doppelkopf and Skat, with `DokoPanel` and
  `SkatPanel`), `DurakTable`, `Hand`, `Trick`, `DealEnd`, `ScoreSheet`, `Final`, `Lobby`, `Guide`.
- **`vendor/ewo/`**: Folio's shared tokens and elements with the card kit (fan, hand gestures, pile
  geometry, tilt, paper grain) and `<ewo-guide>` (`npm run vendor -- stammtisch` in folio). Don't edit
  them here.

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

### Durak

2 to 6 players, 36 cards (6 to Ass), six each; the next card turns up under the stock: trump. The
attacker leads; the defender beats each card (higher in its suit, or a trump over a plain card, a
higher trump over a trump). Everyone else may throw in cards of a rank already on the table: never
more than six in a bout (five in the first) and never more than the defender held. All beaten: the
cards go off, and the defender attacks next. Taken: the defender picks the table up, and the next
player attacks. Everyone draws back up to six, the attacker first. With the stock gone, whoever has
no cards is out; the last one holding cards is the Durak (a point off). House rules: passing the
attack on with a card of its rank (off), who may throw in (everyone, or the defender's neighbours),
five in the first bout (on).

## Commands

```bash
npm install
npm run dev          # the whole app on one port (6410): the game server runs inside Vite
npm test             # the engines, the bots, the match and the rooms (node:test)
npm run check        # svelte-check
npm run build && npm start -- --port 6411    # the production server with the built page
node tools/qa.mjs http://localhost:6411      # one person and bots at each game in WebKit, 390 px
node tools/ladder.mjs skat 300               # the ranks against each other over many deals
```

The QA script borrows Playwright from Folio's checkout next door (`../folio/node_modules`).

## Deploy (NAS)

This mirrors Stichle, Schätzle, Vollmond, Kritzle and CDNMS:

- `ci.yml` runs the typecheck, the tests and the build, then smoke-tests the production server (page,
  headers, a Mau-Mau table with a guest and a bot, the deal, the guest's own hand on their stream and
  no hand on a stream without a player).
- `docker-publish.yml` gates on `ci.yml`, then pushes `ghcr.io/ewolution94/stammtisch:latest` for
  amd64 and arm64.
- The shared Watchtower picks the image up. A push to `release` is the whole deploy, and it ends any
  game in progress: don't push during the afternoon meeting.
- The NAS runs `deploy/portainer-stack.yml`, on the port the workspace's registry holds for it, with
  the health check in Stammtisch's slot (every 747 s, `plans/nas-load.md`).
- The stack joins the external Docker network `ewolution`, where Census listens as `census:4901`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `--port` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `STAMMTISCH_CENSUS` | off | Census's ingest origin, `http://census:4901` on the NAS |
