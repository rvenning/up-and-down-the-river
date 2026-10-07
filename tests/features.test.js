// Dealer rotation, "everyone made it", and the history timeline/charts.
const test = require("node:test");
const assert = require("node:assert");

const { Rules } = require("../js/scoring.js");
const { Game } = require("../js/game.js");
const { Stats } = require("../js/stats.js");
const { Charts } = require("../js/charts.js");

const PLAYERS = [{ id: "a", name: "Ann" }, { id: "b", name: "Bo" }, { id: "c", name: "Cy" }];

test("the deal passes one seat per round and wraps", () => {
  const g = Game.create({ players: PLAYERS, dealerStart: 1 });
  assert.equal(Game.dealerFor(g).id, "b");
  assert.equal(Game.dealerFor(g, 1).id, "c");
  assert.equal(Game.dealerFor(g, 2).id, "a");
  assert.equal(Game.dealerFor(g, 3).id, "b");
});

test("dealerStart defaults to seat 0 and is clamped", () => {
  assert.equal(Game.create({ players: PLAYERS }).dealerStart, 0);
  assert.equal(Game.create({ players: PLAYERS, dealerStart: 9 }).dealerStart, 2);
  const old = Game.create({ players: PLAYERS }); delete old.dealerStart;
  assert.equal(Game.dealerFor(old).id, "a");   // games saved before this feature
});

test("everyone made it: tricks become bids and the round is scored", () => {
  const g = Game.create({ players: PLAYERS });
  g.round = 2;                                  // 3 cards
  Game.setBid(g, "a", 1); Game.setBid(g, "b", 2); Game.setBid(g, "c", 0);
  Game.toPlay(g);
  assert.ok(Game.canAllMake(g));
  Game.allMade(g);
  assert.equal(g.stage, "result");
  assert.deepEqual(g.rounds[2].tricks, { a: 1, b: 2, c: 0 });
  for (const p of PLAYERS) assert.equal(g.rounds[2].scores[p.id], Rules.score(g.rounds[2].bids[p.id], g.rounds[2].bids[p.id]));
});

test("everyone made it is refused when the bids don't add up to the cards", () => {
  const g = Game.create({ players: PLAYERS });
  g.round = 2;
  Game.setBid(g, "a", 2); Game.setBid(g, "b", 2); Game.setBid(g, "c", 0);
  Game.toPlay(g);
  assert.equal(Game.canAllMake(g), false);
  Game.allMade(g);
  assert.equal(g.stage, "play");
  assert.equal(g.rounds.length, 0);
});

function done(winner, at) {
  const g = Game.create({ players: PLAYERS, gameType: "half", now: at });
  const scores = { a: 0, b: 0, c: 0 }; scores[winner] = 20;
  g.rounds = [{ number: 1, cards: 1, bids: { a: 0, b: 0, c: 0 }, tricks: { a: 0, b: 0, c: 0 }, scores }];
  g.stage = "done"; g.completedAt = at;
  return g;
}

test("timeline runs oldest first with running wins, losses and rate", () => {
  const games = [done("b", 3000), done("a", 1000), done("a", 2000)];
  const tl = Stats.timeline(games, "a");
  assert.deepEqual(tl.map((t) => t.won), [true, true, false]);
  assert.deepEqual(tl.map((t) => [t.wins, t.losses]), [[1, 0], [2, 0], [2, 1]]);
  assert.equal(tl[2].winRate, 66.7);
  assert.deepEqual(Stats.timeline(games, "nobody"), []);
});

test("charts render svg, and nothing for an empty history", () => {
  const games = [done("a", 1000), done("b", 2000), done("a", 3000)];
  const tl = Stats.timeline(games, "a");
  assert.match(Charts.winLoss(tl), /^<svg/);
  assert.match(Charts.strip(tl), /<rect/);
  assert.match(Charts.compare([{ name: "Ann", tl }, { name: "Bo", tl: Stats.timeline(games, "b") }]), /polyline/);
  assert.equal(Charts.winLoss([]), "");
  assert.equal(Charts.compare([{ name: "x", tl: [] }]), "");
  assert.ok(!/NaN/.test(Charts.winLoss(Stats.timeline([done("a", 1)], "a"))));
});
