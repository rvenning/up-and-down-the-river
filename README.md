# Up & Down the River — scorer

A table-side scorer for the card game **Up & Down the River**. It asks each
player what they bid, asks how many they took, does the arithmetic, and keeps
the running total. Nothing else — the card game is still the main event.

**[▶ Open it](https://rvenning.github.io/up-and-down-the-river/)**

Not linked from the family games hub: it isn't a game, it's a calculator with
opinions.

## The scoring

| Outcome | Score |
|---|---|
| Made your bid | **10 + your bid** — call four and take four for 14, call nothing and take nothing for 10 |
| Missed it | **−5 for every trick you were out**, over or under |

Overbidding by two and underbidding by two cost exactly the same, which is why
nobody wins this by playing safe, and why bidding zero is worth more than it
looks.

## A round is three taps per player

1. **Bid.** One player at a time, big numbers, tap and it moves to the next
   person. The strip along the top shows everyone's bid as it fills in — tap a
   name to go back and change theirs.
2. **Play.** The app just shows the bids while you play the hand, plus whether
   the table has overbid: *"11 bid for 8 — 3 of you can't make it."*
3. **Tricks.** Same picker. Numbers that would put more tricks on the table than
   were dealt are greyed out, so by the last player there is usually only one
   button still lit, and the round can't be scored until they add up.

Then it scores itself and shows bid, tricks, round score and running total,
ranked, with the made bids ticked.

## Game length, including halfway through

Full game is 1 → 10 → 1, half game is 1 → 10. Either can be picked at the start,
and a full game can be **cut to a half game mid-play** — the case where everyone
reaches ten cards and decides they've had enough. Every score already on the
sheet is kept. That only works on the way up: once the ladder has turned and
you're coming back down, a "half game" no longer means anything.

**Six or more players get a shorter ladder.** Six players at ten cards each is
54 cards and one deck is 52, so the peak drops to what can actually be dealt —
eight each for six players, seven for seven, six for eight. The setup screen
says so before you start.

## Fixing things

Mistakes happen at a card table, so:

- The score sheet (📋) lists every round. **Tap one to correct it** — bid and
  tricks, with steppers, and it won't save until the tricks add up again.
- Only that round is rescored. Totals are a sum, so everything downstream
  corrects itself and no other round is touched.
- **Undo** is in the game menu and covers the last change, whatever it was —
  a mistyped bid, a submitted round, a game length change.

The game in progress is written to storage after every single tap. A phone that
dies mid-round comes back on the same player of the same round.

## Players and their records

Player profiles persist, so starting a game is tapping three names. Each profile
keeps games played, wins, win rate, highest and lowest final score, average,
bids made, and the biggest deficit they've ever come back from to win.

**None of it is stored twice.** Every statistic is recomputed from the saved
games on demand, which means correcting a game from three weeks ago fixes the
career record too. Deleting a player leaves their old games exactly as they
were — games snapshot the names they were played under.

Lowest score is in there deliberately. Somebody has to hold that record.

## Roast Mode 😈

One line under the results, drawn from a bag so the same gag can't land twice in
an evening. It reads the round: a made bid of nothing, a bid missed by four,
three rounds of overbidding in a row, the lead changing hands, somebody stuck at
the bottom since round three.

> "Maybe next round try bidding the number of tricks you can actually win, Sam."

It is about the bidding, never the person, it appears after the round is already
scored, and it's a toggle in Settings. On/off only for now.

## Not built on gamekit (mostly)

Like Just One, this is a standalone app rather than a family game. `lib/` is
vendored from [rvenning/gamekit](https://github.com/rvenning/gamekit) and only
`gk-util`, `gk-ui`, `gk-audio` and `gk-pwa` are used — screens, modals, toast,
sounds and the install prompt. Re-sync with:

```
node "D:\OneDrive\Documents\Claude Code\gamekit\tools\sync-to-game.js" "D:\OneDrive\Documents\Claude Code\up-and-down-the-river"
```

**No `gk-storage` and no `gk-profiles`**: there are no PINs, no Firestore
collection, nothing in the nightly backup, and nothing leaves the device. The
players here are people round a table, not accounts.

Two overrides worth knowing, both in `css/style.css`: `gk-base.css` pins
`.screen` as a centred `position: fixed` column, and this app needs a header /
scrolling body / sticky footer instead; and its `.btn` carries a chunky drop
shadow built for the kids' games, kept but flattened.

## The code

| File | What's in it |
|---|---|
| `js/scoring.js` | The two rules and the ladder. No state. |
| `js/game.js` | The game as one serialisable object, and every move you can make on it. |
| `js/stats.js` | Career records, derived from saved games. Stores nothing. |
| `js/roast.js` | What's worth a joke about a round, and the lines. |
| `js/store.js` | localStorage. |
| `js/main.js` | Screens and wiring. |

The first four are DOM-free and run in a bare node sandbox, which is why they're
the ones with tests.

## Local development

```
npx http-server "D:\OneDrive\Documents\Claude Code\up-and-down-the-river" -p 8118 -c-1
```

Then <http://localhost:8118>. No build step — plain scripts. Number keys 0–9
drive the picker, which is a gift to whoever is testing on a laptop.

## Tests

```
npm test
```

`node --test`, no framework, 58 tests. The scoring, the state machine (rounds
that must add up, corrections that touch one round only, a game length change
that keeps every score), the statistics, and Roast Mode — that a line never
escapes with a `{placeholder}` still in it, and that a bank doesn't repeat
itself until it's spent.

## PWA files

`manifest.json`, `sw.js` (network-first, cache fallback), `icons/` generated by
`tools/make-icons.js` — seven bars climbing to four and back down, which is the
game in one picture. **Bump `CACHE` in `sw.js` whenever a shell file changes**
or devices keep serving the copy they already have.

## Storage

`localStorage` under `river:` — `players`, `games`, `current` (the game in
progress) and `settings`. No account, no sync, no analytics. A finished game is
about 3KB; the last 500 are kept.

## Credits

Up & Down the River is a traditional trick-taking game also known as Oh Hell,
Blackout and about twenty other things. Scoring here follows the house rules of
the group it was built for; other tables count it differently.
