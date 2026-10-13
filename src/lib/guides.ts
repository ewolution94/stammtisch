// How to play, page by page: the table itself (opens once on a device's first visit), then each
// game, written to the default house rules. Guide.svelte draws them in Folio's <ewo-guide>, each
// page's picture with the game's own cards. German first, English beside it.

import type { GameId } from './api';

export type GuideId = 'table' | GameId;
export type Words = { de: string; en: string };

/** A card in a page's picture, laid from the picture's centre (px and degrees), like on the table. */
export interface GuideCard {
  id?: string;
  back?: boolean;
  x: number;
  y: number;
  r: number;
  small?: boolean;
  /** The one that wins: a gold glow. */
  win?: boolean;
  /** Can't be played here: in shadow. */
  dim?: boolean;
}

export interface GuidePage {
  cards: GuideCard[];
  /** A pill under the cards (the trump, a call). */
  tag?: Words;
  /** A gold disc at the top right (a number that matters: 121, 61). */
  badge?: string;
  title: Words;
  text: Words;
}

/** A row of small cards, spread evenly round the centre and fanned a little. */
const row = (ids: string[], gap = 40, y = 0): GuideCard[] =>
  ids.map((id, i) => {
    const t = i - (ids.length - 1) / 2;
    return { id, x: t * gap, y: y + Math.abs(t) * 5, r: t * 6, small: true };
  });

export const GUIDES: Record<GuideId, GuidePage[]> = {
  table: [
    {
      cards: [
        { id: 'c-Q', x: -84, y: 6, r: -14 },
        { id: 's-J', x: -28, y: -6, r: -5 },
        { id: 'h-K', x: 28, y: -6, r: 5 },
        { id: 'd-A', x: 84, y: 6, r: 14 },
      ],
      title: { de: 'Vier Spiele, ein Tisch', en: 'Four games, one table' },
      text: {
        de: 'Mau-Mau, Doppelkopf, Skat und Durak, mit dem deutschen Blatt: Eichel, Grün, Herz und Schellen. Was ihr spielt, sucht ihr am Tisch aus.',
        en: 'Mau-Mau, Doppelkopf, Skat and Durak, with the German deck: Eichel (acorns), Grün (leaves), Herz (hearts) and Schellen (bells). You pick the game at the table.',
      },
    },
    {
      cards: [
        { id: 'h-7', x: -96, y: 22, r: -12, small: true, dim: true },
        { id: 'h-9', x: -48, y: 12, r: -6, small: true, dim: true },
        { id: 's-K', x: 0, y: -20, r: 0, small: true, win: true },
        { id: 's-10', x: 48, y: 12, r: 6, small: true },
        { id: 'd-A', x: 96, y: 22, r: 12, small: true, dim: true },
      ],
      title: { de: 'Eine Karte spielen', en: 'Playing a card' },
      text: {
        de: 'Tipp eine Karte an, sie hebt sich; tipp sie noch einmal, und sie geht auf den Tisch. Oder zieh sie nach oben. Was gerade nicht geht, liegt im Schatten. Halt eine Karte still, um sie groß anzusehen.',
        en: 'Tap a card and it lifts; tap it again and it goes to the table. Or drag it up. What you can’t play right now sits in shadow. Hold a card still to look at it big.',
      },
    },
    {
      cards: [
        { back: true, x: -46, y: 0, r: -8 },
        { back: true, x: 0, y: -8, r: 0 },
        { back: true, x: 46, y: 0, r: 8 },
      ],
      tag: { de: 'Tisch KXPT', en: 'Table KXPT' },
      title: { de: 'Ein Tisch mit Code', en: 'A table with a code' },
      text: {
        de: 'Mach einen Tisch auf und teil den Link oder den Code; leere Plätze füllen Bots. Wer den Tisch aufmacht, wählt Spiel und Hausregeln. Wie jedes Spiel geht, steht hier unter „So geht’s“ und am Tisch.',
        en: 'Open a table and share the link or the code; bots fill empty seats. Whoever opens it picks the game and the house rules. How each game goes is under “How to play”, here and at the table.',
      },
    },
  ],

  maumau: [
    {
      cards: [
        { id: 'h-8', x: -40, y: 0, r: -6 },
        { id: 'h-K', x: 40, y: -10, r: 8, win: true },
      ],
      title: { de: 'Weg mit den Karten', en: 'Get rid of your cards' },
      text: {
        de: 'Jeder bekommt fünf Karten. Reihum legst du eine auf den Stapel: gleiche Farbe oder gleicher Wert. Passt nichts, ziehst du eine. Wer zuerst keine Karte mehr hat, gewinnt das Spiel.',
        en: 'Everyone gets five cards. In turn, lay one on the pile: the same suit or the same value. If nothing fits, draw one. First with no cards left wins the deal.',
      },
    },
    {
      cards: [
        { id: 's-7', x: -70, y: 4, r: -10 },
        { id: 'h-7', x: -30, y: -8, r: 4 },
        { id: 'd-8', x: 66, y: 0, r: 10 },
      ],
      title: { de: 'Sieben und Acht', en: 'Sevens and eights' },
      text: {
        de: 'Nach einer 7 zieht der Nächste zwei Karten, außer er legt selbst eine 7: dann zieht der danach vier. Eine 8 lässt den Nächsten aussetzen.',
        en: 'After a 7 the next player draws two, unless they lay a 7 too: then the one after draws four. An 8 makes the next player miss a turn.',
      },
    },
    {
      cards: [
        { id: 'd-9', x: -38, y: 6, r: -8 },
        { id: 'c-J', x: 30, y: -10, r: 7, win: true },
      ],
      tag: { de: 'Wunsch: Herz', en: 'Wish: Herz' },
      title: { de: 'Der Unter wünscht', en: 'The Unter wishes' },
      text: {
        de: 'Einen Unter darfst du auf jede Karte legen, nur nicht auf einen Unter, und wünschst dir eine Farbe: Die muss als Nächstes kommen.',
        en: 'You may lay an Unter on any card, just not on another Unter, and wish for a suit: that suit has to come next.',
      },
    },
    {
      cards: [{ id: 's-9', x: 0, y: 0, r: -4 }],
      badge: 'Mau!',
      title: { de: '„Mau!“', en: '“Mau!”' },
      text: {
        de: 'Bevor du deine vorletzte Karte legst, tipp auf „Mau!“. Vergessen? Dann ziehst du eine Strafkarte. Jedes gewonnene Spiel bringt einen Punkt.',
        en: 'Before you lay your second-to-last card, tap “Mau!”. Forgot? Then you draw a penalty card. Every deal you win scores a point.',
      },
    },
  ],

  doppelkopf: [
    {
      cards: [
        { id: 'c-Q', x: -54, y: 4, r: -9 },
        { id: 'c-Q', x: -18, y: -6, r: -3 },
        { id: 'h-10', x: 18, y: -6, r: 3 },
        { id: 'h-10', x: 54, y: 4, r: 9 },
      ],
      title: { de: '48 Karten, jede zweimal', en: '48 cards, each one twice' },
      text: {
        de: 'Doppelkopf spielt man zu viert: von der 9 bis zum Daus, jede Karte zweimal, und jeder bekommt zwölf. Sitzen fünf oder sechs am Tisch, setzt der Geber aus.',
        en: 'Doppelkopf is for four: from the 9 up to the Daus, every card twice, and everyone gets twelve. With five or six at the table, the dealer sits out.',
      },
    },
    {
      cards: row(['h-10', 'c-Q', 's-Q', 'h-Q', 'd-Q', 'c-J', 's-J', 'h-J', 'd-J', 'd-A'], 26, 8),
      tag: { de: 'Trumpf, von hoch nach tief', en: 'Trumps, high to low' },
      title: { de: 'Trumpf', en: 'Trumps' },
      text: {
        de: 'Höchster Trumpf ist die Herz 10, die Dulle. Dann die Ober (Eichel, Grün, Herz, Schellen), die Unter in derselben Reihe, dann Schellen Daus, 10, König und 9. Von zwei gleichen Karten im Stich gewinnt die erste.',
        en: 'The highest trump is the Herz 10, the Dulle. Then the Ober (Eichel, Grün, Herz, Schellen), the Unter in the same order, then Schellen Daus, 10, König and 9. Of two equal cards in a trick, the first one wins.',
      },
    },
    {
      cards: [
        { id: 's-A', x: -44, y: -14, r: -9, small: true },
        { id: 's-10', x: 40, y: -18, r: 8, small: true },
        { id: 's-K', x: -36, y: 30, r: 5, small: true },
        { id: 'd-K', x: 38, y: 24, r: -6, small: true, win: true },
      ],
      title: { de: 'Bedienen', en: 'Following suit' },
      text: {
        de: 'Die ausgespielte Farbe musst du bedienen. Ober, Unter, die Herz 10 und alle Schellen sind dabei Trumpf, keine Farbe. Kannst du nicht bedienen, wirfst du ab oder stichst mit Trumpf.',
        en: 'You must follow the suit that was led. The Ober, the Unter, the Herz 10 and all Schellen count as trumps then, not as their suit. If you can’t follow, throw something off or trump it.',
      },
    },
    {
      cards: [
        { id: 'c-Q', x: -30, y: 0, r: -7 },
        { id: 'c-Q', x: 30, y: -6, r: 7 },
      ],
      tag: { de: 'Re', en: 'Re' },
      title: { de: 'Re und Kontra', en: 'Re and Kontra' },
      text: {
        de: 'Wer eine Eichel Ober hat, spielt Re, die anderen Kontra; wer zusammengehört, zeigt sich erst im Spiel. Hat einer beide, ist es eine Hochzeit: Wer in den ersten drei Stichen den ersten Stich macht, wird sein Partner.',
        en: 'Whoever holds an Eichel Ober plays Re, the others Kontra; who’s with whom only shows in play. If one player holds both, it’s a wedding: whoever wins the first trick within the first three becomes their partner.',
      },
    },
    {
      cards: [
        { id: 'd-A', x: -40, y: 4, r: -8, small: true },
        { id: 'c-J', x: 40, y: 4, r: 8, small: true },
      ],
      badge: '121',
      title: { de: '121 gewinnt', en: '121 wins' },
      text: {
        de: 'Re braucht 121 der 240 Augen, Kontra 120. Punkte gibt es fürs Gewinnen, für keine 90, 60, 30 und schwarz, dazu für den gefangenen Fuchs (Schellen Daus), einen Doppelkopf (ein Stich mit 40 Augen) und den Karlchen (Eichel Unter im letzten Stich).',
        en: 'Re needs 121 of the 240 Augen (card points), Kontra 120. Points come for winning, for no 90, 60, 30 and black, and for catching a fox (Schellen Daus), a Doppelkopf (a trick of 40 Augen) and the Karlchen (the Eichel Unter taking the last trick).',
      },
    },
    {
      cards: [
        { id: 'c-Q', x: -50, y: 6, r: -10, small: true },
        { id: 'h-10', x: 0, y: -6, r: 0, small: true },
        { id: 'c-J', x: 50, y: 6, r: 10, small: true },
      ],
      tag: { de: 'Re · keine 90', en: 'Re · no 90' },
      title: { de: 'Ansagen und Solo', en: 'Calls and solos' },
      text: {
        de: 'Mit „Re“ oder „Kontra“ sagst du deine Partei an, solange du elf Karten hast, und das Spiel zählt zwei Punkte mehr; danach geht es mit „keine 90“ weiter. Vor dem Spiel kannst du ein Solo ansagen: allein gegen drei, es zählt dreifach.',
        en: 'With “Re” or “Kontra” you call your side while you still hold eleven cards, and the game counts two points more; “no 90” and the rest come after. Before play you may call a solo: alone against three, and it counts three times.',
      },
    },
  ],

  skat: [
    {
      cards: [
        { back: true, x: -26, y: -4, r: -10, small: true },
        { back: true, x: 26, y: -4, r: 10, small: true },
      ],
      tag: { de: 'Der Skat', en: 'The Skat' },
      title: { de: 'Drei Spieler, 32 Karten', en: 'Three players, 32 cards' },
      text: {
        de: 'Jeder bekommt zehn Karten, zwei liegen verdeckt als Skat. Wer am höchsten reizt, spielt allein gegen die beiden anderen. Zu viert setzt der Geber aus.',
        en: 'Everyone gets ten cards; two lie face down as the Skat. Whoever bids highest plays alone against the other two. With four at the table, the dealer sits out.',
      },
    },
    {
      cards: row(['c-J', 's-J', 'c-A', 'c-10', 'c-K'], 44),
      tag: { de: '18 · 20 · 22 · 23 · 24 …', en: '18 · 20 · 22 · 23 · 24 …' },
      title: { de: 'Reizen', en: 'Bidding' },
      text: {
        de: 'Mittelhand reizt Vorhand: 18, 20, 22, 23, 24, 27 … Vorhand hält mit „Ja“, bis einer passt; dann reizt Hinterhand den, der übrig ist. Reiz nur so hoch, wie dein Spiel wert ist.',
        en: 'Middlehand bids to Forehand: 18, 20, 22, 23, 24, 27 … Forehand holds with “Yes” until one of them passes; then Rearhand bids against the one left. Bid only as high as your game is worth.',
      },
    },
    {
      cards: [
        { back: true, x: -70, y: -24, r: -14, small: true },
        { back: true, x: -36, y: -30, r: -4, small: true },
        { id: 'h-A', x: 18, y: 14, r: 4, small: true },
        { id: 'h-10', x: 60, y: 20, r: 12, small: true },
      ],
      title: { de: 'Skat und Ansage', en: 'The Skat and the game' },
      text: {
        de: 'Wer das Reizen gewinnt, nimmt den Skat auf und drückt zwei Karten, oder spielt Hand, ohne Skat, das zählt mehr. Dann sagt er sein Spiel an: eine Farbe als Trumpf, Grand (nur die Unter sind Trumpf) oder Null (keinen Stich machen).',
        en: 'The winner of the bidding picks up the Skat and lays two cards away, or plays Hand, without it, which counts more. Then they name the game: a suit as trumps, Grand (only the Unter are trumps) or Null (take no trick at all).',
      },
    },
    {
      cards: row(['c-J', 's-J', 'h-J', 'd-J', 'c-A', 'c-10', 'c-K'], 32, 6),
      tag: { de: 'Eichel ist Trumpf', en: 'Eichel are trumps' },
      title: { de: 'Trumpf', en: 'Trumps' },
      text: {
        de: 'Die vier Unter sind immer die höchsten Trümpfe: Eichel, Grün, Herz, Schellen. Danach kommt die Trumpffarbe: Daus, 10, König, Ober, 9, 8, 7.',
        en: 'The four Unter are always the highest trumps: Eichel, Grün, Herz, Schellen. Then comes the trump suit: Daus, 10, König, Ober, 9, 8, 7.',
      },
    },
    {
      cards: row(['d-A', 'd-10', 'd-K', 'd-Q', 'd-J'], 42),
      badge: '61',
      title: { de: '61 Augen', en: '61 Augen' },
      text: {
        de: 'Der Spieler braucht 61 der 120 Augen: Daus 11, 10 zählt 10, König 4, Ober 3, Unter 2. Mit 90 Augen sind die anderen Schneider, mit allen Stichen schwarz.',
        en: 'The declarer needs 61 of the 120 Augen (card points): the Daus counts 11, the 10 ten, the König 4, the Ober 3, the Unter 2. With 90 the others are Schneider; with every trick, black.',
      },
    },
    {
      cards: [
        { id: 'c-J', x: -30, y: 0, r: -8, small: true },
        { id: 's-J', x: 30, y: -4, r: 8, small: true },
      ],
      tag: { de: 'Mit 2, Spiel 3 · 3 × 12 = 36', en: 'With 2, game 3 · 3 × 12 = 36' },
      title: { de: 'Der Spielwert', en: 'What a game is worth' },
      text: {
        de: 'Grundwert mal Stufen. Grundwerte: Eichel 12, Grün 11, Herz 10, Schellen 9, Grand 24. Stufen: mit oder ohne so viele Unter von oben, eins fürs Spiel, je eins für Hand, Schneider und schwarz. Null hat feste Werte. Verloren zählt doppelt.',
        en: 'Base value times levels. Base values: Eichel 12, Grün 11, Herz 10, Schellen 9, Grand 24. Levels: with or without so many Unter from the top, one for the game, one each for Hand, Schneider and black. Null has fixed values. A lost game counts double.',
      },
    },
  ],

  durak: [
    {
      cards: [
        { back: true, x: -30, y: 0, r: 0 },
        { id: 'h-6', x: 34, y: 6, r: 90, small: true },
      ],
      tag: { de: 'Trumpf: Herz', en: 'Trumps: Herz' },
      title: { de: '36 Karten und Trumpf', en: '36 cards and a trump' },
      text: {
        de: 'Gespielt wird von der 6 bis zum Daus, jeder bekommt sechs Karten. Die letzte Karte liegt offen quer unter dem Stapel: Ihre Farbe ist Trumpf.',
        en: 'The cards run from the 6 up to the Daus, and everyone gets six. The last card lies face up across the bottom of the stock: its suit is trumps.',
      },
    },
    {
      cards: [
        { id: 's-9', x: -46, y: -4, r: -6 },
        { id: 's-K', x: -30, y: 14, r: 10, win: true },
        { id: 'd-9', x: 54, y: -2, r: 6 },
      ],
      title: { de: 'Angreifen und schlagen', en: 'Attack and beat' },
      text: {
        de: 'Der Angreifer legt eine Karte, sein linker Nachbar verteidigt: mit einer höheren Karte derselben Farbe oder mit Trumpf. Alle anderen dürfen Karten nachlegen, deren Wert schon auf dem Tisch liegt; im ersten Angriff höchstens fünf.',
        en: 'The attacker lays a card and the player on their left defends: with a higher card of the same suit, or with a trump. Everyone else may throw in cards of a value already on the table; at most five in the first attack.',
      },
    },
    {
      cards: [
        { id: 'c-10', x: -40, y: 0, r: -8, small: true },
        { id: 'c-A', x: -26, y: 16, r: 6, small: true },
        { id: 'h-10', x: 40, y: 0, r: 8, small: true },
      ],
      tag: { de: 'Aufnehmen oder Bito', en: 'Take, or beaten off' },
      title: { de: 'Aufnehmen oder Bito', en: 'Take, or beaten off' },
      text: {
        de: 'Kann der Verteidiger nicht alles schlagen, nimmt er die Karten auf, und der Nächste nach ihm greift an. Ist alles geschlagen, kommt der Stoß vom Tisch, und er greift selbst an. Danach füllt jeder vom Stapel auf sechs auf.',
        en: 'If the defender can’t beat it all, they take the cards up and the player after them attacks. If everything is beaten, the cards go off the table and the defender attacks next. Then everyone draws back up to six from the stock.',
      },
    },
    {
      cards: [
        { id: 'd-6', x: -30, y: 4, r: -8, small: true },
        { id: 'h-7', x: 0, y: -4, r: 0, small: true },
        { id: 'c-8', x: 30, y: 4, r: 8, small: true },
      ],
      tag: { de: 'Durak', en: 'Durak' },
      title: { de: 'Der Durak', en: 'The Durak' },
      text: {
        de: 'Ist der Stapel leer, wird ohne Nachziehen weitergespielt. Wer keine Karten mehr hat, ist raus. Wer am Ende als Letzter Karten hält, ist der Durak, der Dummkopf, und bekommt einen Minuspunkt.',
        en: 'Once the stock is empty, play goes on without drawing. Whoever runs out of cards is out. The last one left holding cards is the Durak, the fool, and gets a minus point.',
      },
    },
  ],
};
