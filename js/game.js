// Up & Down the River · the game state.
//
// One plain serialisable object is the whole game. Every function here takes it
// and mutates it, which means saving a game in progress is JSON.stringify and
// nothing else — the app can be killed mid-round on a phone and come back
// exactly where it was.
//
// Round scores are independent of each other: each one is decided by that
// round's bid and tricks alone. That is what makes corrections cheap — fixing
// round 3 rescores round 3 and nothing else, and the totals fall out of a sum.
//
// No DOM, no globals, no GK — tests/game.test.js runs this in a bare sandbox.

const RulesRef = typeof require === "function" && typeof module !== "undefined"
  ? require("./scoring.js").Rules
  : Rules;

const Game = {
  // stage: bid -> play -> tally -> result -> (next round) bid ... -> done
  create({ players, gameType = "full", id, now = Date.now() }) {
    if (!Array.isArray(players) || players.length < 2)
      throw new Error("a game needs at least 2 players");

    return {
      v: 1,
      id: id || "g" + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      createdAt: now,
      completedAt: null,
      gameType,
      // Names are snapshotted: renaming or deleting a player later must not
      // rewrite the history of a game they already played.
      players: players.map((p) => ({ id: p.id, name: p.name })),
      round: 0,
      stage: "bid",
      bids: {},
      tricks: {},
      rounds: [],
    };
  },

  /* ----- shape of the game ------------------------------------------------ */

  ladder(g) { return RulesRef.ladder(g.gameType, g.players.length); },
  roundCount(g) { return this.ladder(g).length; },
  peak(g) { return RulesRef.peak(g.players.length); },

  // Cards dealt this round. Past the end of the ladder (a finished game) the
  // honest answer is 0, not undefined.
  cards(g) { return this.ladder(g)[g.round] || 0; },
  roundNumber(g) { return Math.min(g.round + 1, this.roundCount(g)); },
  isDone(g) { return g.stage === "done"; },

  /* ----- bidding ----------------------------------------------------------- */

  setBid(g, playerId, n) {
    if (n == null) delete g.bids[playerId];
    else g.bids[playerId] = clampTo(n, 0, this.cards(g));
    return g;
  },

  bidsIn(g) { return g.players.every((p) => g.bids[p.id] != null); },
  bidTotal(g) { return g.players.reduce((t, p) => t + (g.bids[p.id] || 0), 0); },

  // Positive = the table has overbid and someone must go down; negative =
  // underbid, so somebody is taking tricks they never asked for.
  bidGap(g) { return this.bidTotal(g) - this.cards(g); },

  /* ----- tricks ------------------------------------------------------------ */

  setTricks(g, playerId, n) {
    if (n == null) delete g.tricks[playerId];
    else g.tricks[playerId] = clampTo(n, 0, this.cards(g));
    return g;
  },

  tricksTotal(g) { return g.players.reduce((t, p) => t + (g.tricks[p.id] || 0), 0); },

  // Every player accounted for AND the tricks add up to the cards dealt. The
  // second half is the one that catches a mis-tap at the table.
  tricksIn(g) {
    return g.players.every((p) => g.tricks[p.id] != null) && this.tricksTotal(g) === this.cards(g);
  },

  /* ----- moving through a round -------------------------------------------- */

  toPlay(g) { if (this.bidsIn(g)) g.stage = "play"; return g; },
  toBids(g) { if (g.stage === "play" || g.stage === "tally") g.stage = "bid"; return g; },
  toTally(g) { if (g.stage === "play" || g.stage === "bid") g.stage = "tally"; return g; },

  // Commit the round. Scores are worked out here once and stored, so a saved
  // game never depends on the rules file agreeing with itself later.
  submit(g) {
    if (!this.tricksIn(g)) return g;

    const bids = {}, tricks = {}, scores = {};
    for (const p of g.players) {
      bids[p.id] = g.bids[p.id] || 0;
      tricks[p.id] = g.tricks[p.id] || 0;
      scores[p.id] = RulesRef.score(bids[p.id], tricks[p.id]);
    }

    g.rounds[g.round] = { number: g.round + 1, cards: this.cards(g), bids, tricks, scores };
    g.stage = "result";
    return g;
  },

  // Leave the results screen: on to the next round, or the game is over.
  next(g, now = Date.now()) {
    if (g.stage !== "result") return g;
    g.round++;
    g.bids = {};
    g.tricks = {};
    if (g.round >= this.roundCount(g)) this.finish(g, now);
    else g.stage = "bid";
    return g;
  },

  finish(g, now = Date.now()) {
    g.stage = "done";
    g.completedAt = now;
    return g;
  },

  /* ----- corrections -------------------------------------------------------- */

  // Rewrite a completed round. Only that round is rescored — the totals are a
  // sum, so everything downstream corrects itself.
  editRound(g, index, bids, tricks) {
    const r = g.rounds[index];
    if (!r) return g;

    for (const p of g.players) {
      if (bids && bids[p.id] != null) r.bids[p.id] = clampTo(bids[p.id], 0, r.cards);
      if (tricks && tricks[p.id] != null) r.tricks[p.id] = clampTo(tricks[p.id], 0, r.cards);
      r.scores[p.id] = RulesRef.score(r.bids[p.id] || 0, r.tricks[p.id] || 0);
    }
    return g;
  },

  // A corrected round still has to add up. The editor won't save until it does.
  roundTricksIn(g, index) {
    const r = g.rounds[index];
    if (!r) return false;
    return g.players.reduce((t, p) => t + (r.tricks[p.id] || 0), 0) === r.cards;
  },

  /* ----- changing the game length ------------------------------------------ */

  // Half -> full always works: it only adds rounds. Full -> half is a promise
  // that the game ends at the top of the ladder, so it can only be made while
  // the game is still on the way up.
  canConvert(g, type) {
    if (g.stage === "done" || type === g.gameType) return false;
    if (type === "half") return g.rounds.length <= this.peak(g);
    return true;
  },

  convert(g, type, now = Date.now()) {
    if (!this.canConvert(g, type)) return g;
    g.gameType = type;
    // Shortening past where play has already reached ends the game — except on
    // the results screen, where "next" is about to do it anyway.
    if (g.stage !== "result" && g.round >= this.roundCount(g)) this.finish(g, now);
    return g;
  },

  /* ----- scores ------------------------------------------------------------- */

  totals(g) { return this.totalsAfter(g, g.rounds.length); },

  // Totals as they stood after the first `n` completed rounds — the raw
  // material for the score grid and for spotting a comeback.
  totalsAfter(g, n) {
    const out = {};
    for (const p of g.players) out[p.id] = 0;
    for (let i = 0; i < n && i < g.rounds.length; i++)
      for (const p of g.players) out[p.id] += g.rounds[i].scores[p.id] || 0;
    return out;
  },

  // Highest first. Players level on points share a rank (1, 1, 3) — this game
  // has no tie-break and inventing one would quietly rewrite results.
  standings(g, n) {
    const totals = n == null ? this.totals(g) : this.totalsAfter(g, n);
    const rows = g.players
      .map((p) => ({ id: p.id, name: p.name, total: totals[p.id] }))
      .sort((a, b) => b.total - a.total);

    rows.forEach((r, i) => {
      r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
    });
    return rows;
  },

  leader(g) { return this.standings(g)[0]; },
  winners(g) { return this.standings(g).filter((r) => r.rank === 1); },

  /* ----- undo --------------------------------------------------------------- */

  // A deep copy through JSON, which is exactly what gets stored — if a value
  // doesn't survive this it had no business being in the game state.
  clone(g) { return JSON.parse(JSON.stringify(g)); },
};

function clampTo(n, lo, hi) {
  n = Math.round(Number(n) || 0);
  return n < lo ? lo : n > hi ? hi : n;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Game };
}
