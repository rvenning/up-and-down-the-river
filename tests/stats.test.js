// Career statistics, derived from saved games.
//
// The fixtures below are built as finished games rather than played out through
// the state machine, so a change to the ladder can't quietly rewrite what these
// tests are asserting about the maths.

const test = require("node:test");
const assert = require("node:assert");

const { Rules } = require("../js/scoring.js");
const { Game } = require("../js/game.js");
const { Stats } = require("../js/stats.js");

const PLAYERS = [{ id: "p1", name: "Rob" }, { id: "p2", name: "Sam" }, { id: "p3", name: "Josh" }];

function finished(rounds, over = {}) {
  const g = Game.create({ players: PLAYERS, gameType: "half", now: 1000 });
  g.rounds = rounds.map((spec, i) => {
    const scores = {};
    for (const p of PLAYERS) scores[p.id] = Rules.score(spec.bids[p.id], spec.tricks[p.id]);
    return {
      number: i + 1,
      cards: PLAYERS.reduce((t, p) => t + spec.tricks[p.id], 0),
      bids: { ...spec.bids },
      tricks: { ...spec.tricks },
      scores,
    };
  });
  g.round = g.rounds.length;
  g.stage = "done";
  g.completedAt = 5000;
  return Object.assign(g, over);
}

// Rob is 17 behind after two rounds and wins by one on the last.
// Totals run: (-5, -5, 10) -> (5, 5, 22) -> (18, 15, 17).
const GAME_A = finished([
  { bids: { p1: 1, p2: 0, p3: 0 }, tricks: { p1: 0, p2: 1, p3: 0 } },
  { bids: { p1: 0, p2: 0, p3: 2 }, tricks: { p1: 0, p2: 0, p3: 2 } },
  { bids: { p1: 3, p2: 0, p3: 1 }, tricks: { p1: 3, p2: 0, p3: 0 } },
], { id: "A", completedAt: 5000 });

// A short one where Rob comes last. Totals: (-5, 10, 11).
const GAME_B = finished([
  { bids: { p1: 1, p2: 0, p3: 1 }, tricks: { p1: 0, p2: 0, p3: 1 } },
], { id: "B", completedAt: 6000 });

// Abandoned halfway. Must not count towards anything.
const GAME_UNFINISHED = finished([
  { bids: { p1: 0, p2: 0, p3: 1 }, tricks: { p1: 0, p2: 0, p3: 1 } },
], { id: "C", completedAt: null, stage: "bid" });

const ALL = [GAME_A, GAME_B, GAME_UNFINISHED];

test("the fixtures score the way the rules say they do", () => {
  assert.deepStrictEqual(Game.totals(GAME_A), { p1: 18, p2: 15, p3: 17 });
  assert.deepStrictEqual(Game.totals(GAME_B), { p1: -5, p2: 10, p3: 11 });
});

test("an abandoned game counts for nobody", () => {
  assert.strictEqual(Stats.finished(ALL).length, 2);
  assert.strictEqual(Stats.playerStats(ALL, "p1").played, 2);
});

test("finished games come back newest first", () => {
  assert.deepStrictEqual(Stats.finished(ALL).map((g) => g.id), ["B", "A"]);
});

test("a player's record adds up", () => {
  const s = Stats.playerStats(ALL, "p1");
  assert.strictEqual(s.played, 2);
  assert.strictEqual(s.won, 1);
  assert.strictEqual(s.winRate, 50);
  assert.strictEqual(s.highest, 18);
  assert.strictEqual(s.lowest, -5);
  assert.strictEqual(s.average, 6.5);
  assert.strictEqual(s.bestPosition, 1);
  assert.strictEqual(s.lastPlayed, 6000);
});

test("perfect bids are counted across every round of every game", () => {
  // Rob: rounds 2 and 3 of game A. Nothing in game B.
  const rob = Stats.playerStats(ALL, "p1");
  assert.strictEqual(rob.roundsPlayed, 4);
  assert.strictEqual(rob.perfectBids, 2);
  assert.strictEqual(rob.perfectRate, 50);

  // Josh: rounds 1 and 2 of game A, then round 1 of B.
  assert.strictEqual(Stats.playerStats(ALL, "p3").perfectBids, 3);
});

test("a player who never played has an empty, harmless record", () => {
  const s = Stats.playerStats(ALL, "nobody");
  assert.strictEqual(s.played, 0);
  assert.strictEqual(s.winRate, 0);
  assert.strictEqual(s.highest, null);
  assert.strictEqual(s.lowest, null);
  assert.strictEqual(s.average, null);
  assert.strictEqual(s.bestPosition, null);
});

test("position is where you finished, and level scores share it", () => {
  assert.strictEqual(Stats.positionOf(GAME_A, "p1"), 1);
  assert.strictEqual(Stats.positionOf(GAME_A, "p3"), 2);
  assert.strictEqual(Stats.positionOf(GAME_A, "p2"), 3);
  assert.strictEqual(Stats.positionOf(GAME_B, "p1"), 3);
});

test("the deficit faced is the worst gap at the end of any round, not the last", () => {
  // Rob trails by 15 after round one and 17 after round two, then wins.
  assert.strictEqual(Stats.deficitFaced(GAME_A, "p1"), 17);
  assert.strictEqual(Stats.deficitFaced(GAME_A, "p3"), 0, "Josh led the whole way");
});

test("a comeback only counts when the player actually won", () => {
  const rob = Stats.playerStats(ALL, "p1");
  assert.strictEqual(rob.biggestComeback, 17);
  // Sam trailed badly in game A too, but lost it.
  assert.strictEqual(Stats.playerStats(ALL, "p2").biggestComeback, 0);
});

test("a shared win counts for everyone who tied", () => {
  const tied = finished([
    { bids: { p1: 0, p2: 0, p3: 1 }, tricks: { p1: 0, p2: 0, p3: 1 } },
  ], { id: "T" });
  tied.rounds[0].scores = { p1: 12, p2: 12, p3: 5 };

  assert.deepStrictEqual(Game.winners(tied).map((r) => r.id), ["p1", "p2"]);
  assert.strictEqual(Stats.playerStats([tied], "p1").won, 1);
  assert.strictEqual(Stats.playerStats([tied], "p2").won, 1);
  assert.strictEqual(Stats.playerStats([tied], "p3").won, 0);
});

test("highlights pick out the comeback, the best round and the worst", () => {
  const h = Stats.highlights(GAME_A);
  assert.strictEqual(h.comeback.id, "p1");
  assert.strictEqual(h.comeback.points, 17);
  assert.strictEqual(h.bestRound.points, 13);
  assert.strictEqual(h.bestRound.id, "p1");
  assert.strictEqual(h.bestRound.round, 3);
  assert.strictEqual(h.worstRound.points, -5);
  assert.strictEqual(h.mostPerfect.n, 2);
});

test("highlights stay quiet when nothing interesting happened", () => {
  // One round, everybody made it, nobody was ever behind.
  const dull = finished([
    { bids: { p1: 0, p2: 0, p3: 1 }, tricks: { p1: 0, p2: 0, p3: 1 } },
  ]);
  const h = Stats.highlights(dull);
  assert.strictEqual(h.comeback, null, "leading from the front is not a comeback");
  assert.strictEqual(h.mostPerfect, null, "one perfect bid is not a haul");
  assert.strictEqual(h.worstRound, null, "nobody went negative");
  assert.strictEqual(h.bestRound.points, 11);
});
