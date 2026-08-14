// Up & Down the River · the rules.
//
// A made bid scores 10 plus the bid — call four and take four for 14, call
// nothing and take nothing for 10. Miss it and you lose 5 for every trick you
// were out, in either direction: overbidding by two and underbidding by two
// cost exactly the same. That is why nobody ever wins this game by playing
// safe, and why bidding zero is worth more than it looks.
//
// No DOM, no globals, no GK — tests/scoring.test.js runs this in a bare sandbox.

const MADE_BASE = 10;      // points for making your bid, before the bid itself
const MISS_PER_TRICK = 5;  // lost per trick out, over or under
const MAX_CARDS = 10;      // the top of the ladder
const DECK = 52;

const Rules = {
  MADE_BASE,
  MISS_PER_TRICK,
  MAX_CARDS,
  DECK,

  score(bid, tricks) {
    return bid === tricks ? MADE_BASE + bid : -MISS_PER_TRICK * Math.abs(bid - tricks);
  },

  // The hand climbs to ten cards each — or to whatever one 52-card deck can
  // actually deal, which is all six players get to eight and seven get to
  // seven. Hard-coding ten would put two undealable rounds at the top of any
  // six-handed game.
  peak(playerCount) {
    return Math.max(1, Math.min(MAX_CARDS, Math.floor(DECK / playerCount)));
  },

  // Cards per player for every round in order: 1..peak for a half game,
  // 1..peak..1 for a full one.
  ladder(gameType, playerCount) {
    const peak = this.peak(playerCount);
    const out = [];
    for (let i = 1; i <= peak; i++) out.push(i);
    if (gameType !== "half") for (let i = peak - 1; i >= 1; i--) out.push(i);
    return out;
  },

  // "1 → 8 → 1" / "1 → 10", for the setup screen.
  ladderLabel(gameType, playerCount) {
    const peak = this.peak(playerCount);
    return gameType === "half" ? `1 → ${peak}` : `1 → ${peak} → 1`;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Rules, MADE_BASE, MISS_PER_TRICK, MAX_CARDS, DECK };
}
