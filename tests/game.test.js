// The game state machine.
//
// These are the bugs that actually hurt at a table: a round that scores twice,
// a correction that silently changes a different round, tricks that don't add
// up being accepted, or a shortened game losing the scores it promised to keep.

const test = require("node:test");
const assert = require("node:assert");

const { Game } = require("../js/game.js");

const PLAYERS = [{ id: "p1", name: "Rob" }, { id: "p2", name: "Sam" }, { id: "p3", name: "Josh" }];

const start = (over = {}) => Game.create({ players: PLAYERS, now: 1000, ...over });

// Play one round from bids and tricks keyed by player id, all the way to the
// next round's bidding.
function playRound(g, bids, tricks) {
  for (const id in bids) Game.setBid(g, id, bids[id]);
  Game.toPlay(g);
  Game.toTally(g);
  for (const id in tricks) Game.setTricks(g, id, tricks[id]);
  Game.submit(g);
  Game.next(g, 2000);
  return g;
}

// A whole game of nobody making anything, to get to the end quickly.
function playOut(g) {
  while (!Game.isDone(g)) {
    const cards = Game.cards(g);
    const bids = {}, tricks = {};
    PLAYERS.forEach((p, i) => { bids[p.id] = 0; tricks[p.id] = i === 0 ? cards : 0; });
    playRound(g, bids, tricks);
  }
  return g;
}

test("a game needs at least two players", () => {
  assert.throws(() => Game.create({ players: [PLAYERS[0]] }), /at least 2/);
  assert.throws(() => Game.create({ players: [] }), /at least 2/);
});

test("a new game starts on round one, bidding, with nothing scored", () => {
  const g = start();
  assert.strictEqual(g.stage, "bid");
  assert.strictEqual(Game.roundNumber(g), 1);
  assert.strictEqual(Game.cards(g), 1);
  assert.strictEqual(Game.roundCount(g), 19);
  assert.deepStrictEqual(Game.totals(g), { p1: 0, p2: 0, p3: 0 });
});

test("bids and tricks are clamped to the cards actually dealt", () => {
  const g = start();
  Game.setBid(g, "p1", 7);
  assert.strictEqual(g.bids.p1, 1, "round one deals one card");
  Game.setBid(g, "p2", -3);
  assert.strictEqual(g.bids.p2, 0);
  Game.setTricks(g, "p1", 9);
  assert.strictEqual(g.tricks.p1, 1);
});

test("a round can't be submitted until the tricks add up", () => {
  const g = start();
  playRound(g, { p1: 0, p2: 1, p3: 0 }, { p1: 0, p2: 1, p3: 0 });   // round 1: 1 card
  // Round 2 deals two cards; two of them going to one player leaves one loose.
  Game.setBid(g, "p1", 1); Game.setBid(g, "p2", 1); Game.setBid(g, "p3", 0);
  Game.toTally(g);
  Game.setTricks(g, "p1", 1);
  assert.ok(!Game.tricksIn(g), "not every player has a number yet");

  Game.setTricks(g, "p2", 0); Game.setTricks(g, "p3", 0);
  assert.ok(!Game.tricksIn(g), "one card is unaccounted for");
  assert.strictEqual(Game.tricksTotal(g), 1);

  Game.submit(g);
  assert.strictEqual(g.stage, "tally", "submit is a no-op while the round doesn't add up");
  assert.strictEqual(g.rounds.length, 1);

  Game.setTricks(g, "p3", 1);
  assert.ok(Game.tricksIn(g));
  Game.submit(g);
  assert.strictEqual(g.stage, "result");
  assert.strictEqual(g.rounds.length, 2);
});

test("a submitted round scores every player and totals up", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });

  const r = g.rounds[0];
  assert.strictEqual(r.number, 1);
  assert.strictEqual(r.cards, 1);
  assert.deepStrictEqual(r.scores, { p1: 11, p2: 10, p3: 10 });
  assert.deepStrictEqual(Game.totals(g), { p1: 11, p2: 10, p3: 10 });
  assert.strictEqual(Game.roundNumber(g), 2);
  assert.strictEqual(g.stage, "bid");
  assert.deepStrictEqual(g.bids, {}, "the new round starts empty");
});

test("the bid gap tells the table whether it has overbid", () => {
  const g = start();
  playRound(g, { p1: 0, p2: 0, p3: 1 }, { p1: 0, p2: 0, p3: 1 });
  Game.setBid(g, "p1", 2); Game.setBid(g, "p2", 1); Game.setBid(g, "p3", 1);
  assert.strictEqual(Game.cards(g), 2);
  assert.strictEqual(Game.bidTotal(g), 4);
  assert.strictEqual(Game.bidGap(g), 2, "four bid, two available");
});

test("standings put the highest first and share a rank on a tie", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });   // 11, 10, 10
  const s = Game.standings(g);
  assert.deepStrictEqual(s.map((r) => r.id), ["p1", "p2", "p3"]);
  assert.deepStrictEqual(s.map((r) => r.rank), [1, 2, 2]);
  assert.strictEqual(Game.leader(g).id, "p1");
  assert.deepStrictEqual(Game.winners(g).map((r) => r.id), ["p1"]);
});

test("everyone level means everyone wins", () => {
  const g = start();
  playRound(g, { p1: 0, p2: 0, p3: 1 }, { p1: 0, p2: 0, p3: 1 });   // 10, 10, 11
  Game.editRound(g, 0, { p3: 0 }, { p3: 0 });
  // Now nobody took the trick, which can't happen — but the ranks are the point.
  const totals = Game.totals(g);
  assert.deepStrictEqual(totals, { p1: 10, p2: 10, p3: 10 });
  assert.deepStrictEqual(Game.winners(g).map((r) => r.id), ["p1", "p2", "p3"]);
});

test("correcting a round rescores that round and nothing else", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });
  playRound(g, { p1: 2, p2: 0, p3: 0 }, { p1: 2, p2: 0, p3: 0 });
  const before = Game.totals(g);
  assert.deepStrictEqual(before, { p1: 23, p2: 20, p3: 20 });

  // Sam actually took one of those two, and Rob only got one.
  Game.editRound(g, 1, null, { p1: 1, p2: 1 });
  assert.deepStrictEqual(g.rounds[0].scores, { p1: 11, p2: 10, p3: 10 }, "round one is untouched");
  assert.deepStrictEqual(g.rounds[1].scores, { p1: -5, p2: -5, p3: 10 });
  assert.deepStrictEqual(Game.totals(g), { p1: 6, p2: 5, p3: 20 });
});

test("a correction is refused the chance to leave a round not adding up", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });
  playRound(g, { p1: 2, p2: 0, p3: 0 }, { p1: 2, p2: 0, p3: 0 });
  assert.ok(Game.roundTricksIn(g, 1));
  Game.editRound(g, 1, null, { p1: 1 });
  assert.ok(!Game.roundTricksIn(g, 1), "one of the two tricks is now homeless");
});

test("totals after N rounds is the running score at that point", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });
  playRound(g, { p1: 0, p2: 2, p3: 0 }, { p1: 0, p2: 2, p3: 0 });
  assert.deepStrictEqual(Game.totalsAfter(g, 0), { p1: 0, p2: 0, p3: 0 });
  assert.deepStrictEqual(Game.totalsAfter(g, 1), { p1: 11, p2: 10, p3: 10 });
  assert.deepStrictEqual(Game.totalsAfter(g, 2), { p1: 21, p2: 22, p3: 20 });
});

test("a full game runs nineteen rounds and then finishes", () => {
  const g = playOut(start());
  assert.strictEqual(g.rounds.length, 19);
  assert.strictEqual(g.stage, "done");
  assert.ok(g.completedAt);
  assert.strictEqual(Game.cards(g), 0, "no round is being dealt any more");
  assert.strictEqual(Game.roundNumber(g), 19);
});

test("a half game finishes at the top of the ladder", () => {
  const g = playOut(start({ gameType: "half" }));
  assert.strictEqual(g.rounds.length, 10);
  assert.strictEqual(g.rounds[9].cards, 10);
});

test("a full game can be cut to a half game and keeps every score", () => {
  const g = start();
  for (let i = 0; i < 10; i++) {
    const cards = Game.cards(g);
    playRound(g, { p1: cards, p2: 0, p3: 0 }, { p1: cards, p2: 0, p3: 0 });
  }
  const before = Game.totals(g);
  assert.strictEqual(g.rounds.length, 10);
  assert.ok(Game.canConvert(g, "half"));

  Game.convert(g, "half", 3000);
  assert.strictEqual(g.stage, "done");
  assert.strictEqual(g.rounds.length, 10, "nothing was thrown away");
  assert.deepStrictEqual(Game.totals(g), before);
});

test("a game already coming back down can't be cut short", () => {
  const g = start();
  for (let i = 0; i < 11; i++) {
    const cards = Game.cards(g);
    playRound(g, { p1: cards, p2: 0, p3: 0 }, { p1: cards, p2: 0, p3: 0 });
  }
  assert.strictEqual(g.rounds.length, 11, "eleven rounds means the ladder has turned");
  assert.ok(!Game.canConvert(g, "half"));
  Game.convert(g, "half");
  assert.strictEqual(g.gameType, "full");
});

test("a half game can be extended into a full one mid-play", () => {
  const g = start({ gameType: "half" });
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });
  assert.strictEqual(Game.roundCount(g), 10);
  assert.ok(Game.canConvert(g, "full"));
  Game.convert(g, "full");
  assert.strictEqual(Game.roundCount(g), 19);
  assert.strictEqual(g.stage, "bid");
  assert.strictEqual(g.rounds.length, 1);
});

test("a finished game can't be converted at all", () => {
  const g = playOut(start({ gameType: "half" }));
  assert.ok(!Game.canConvert(g, "full"));
  assert.ok(!Game.canConvert(g, "half"));
});

test("stage moves don't skip: play needs every bid in", () => {
  const g = start();
  Game.setBid(g, "p1", 1);
  Game.toPlay(g);
  assert.strictEqual(g.stage, "bid", "one bid short");
  Game.setBid(g, "p2", 0); Game.setBid(g, "p3", 0);
  Game.toPlay(g);
  assert.strictEqual(g.stage, "play");
  Game.toBids(g);
  assert.strictEqual(g.stage, "bid", "you can always go back and fix a bid");
});

test("next() only does anything from the results screen", () => {
  const g = start();
  Game.next(g);
  assert.strictEqual(g.round, 0);
  assert.strictEqual(g.stage, "bid");
});

test("a clone is a real copy — undo can't be undermined", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });
  const snap = Game.clone(g);

  Game.editRound(g, 0, null, { p1: 0, p2: 1 });
  Game.setBid(g, "p1", 2);
  assert.deepStrictEqual(snap.rounds[0].scores, { p1: 11, p2: 10, p3: 10 });
  assert.deepStrictEqual(snap.bids, {});
});

test("a game survives a round trip through storage", () => {
  const g = start();
  playRound(g, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 0, p3: 0 });
  Game.setBid(g, "p2", 2);

  const back = JSON.parse(JSON.stringify(g));
  assert.deepStrictEqual(back, g);
  assert.strictEqual(Game.cards(back), 2);
  assert.deepStrictEqual(Game.totals(back), Game.totals(g));
});
