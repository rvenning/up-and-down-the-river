// Roast Mode.
//
// Two things matter here and neither is comedy: a line must never come out with
// a {placeholder} still in it, and the same gag must not land twice in an
// evening. A seeded RNG makes both testable.

const test = require("node:test");
const assert = require("node:assert");

const { Rules } = require("../js/scoring.js");
const { Game } = require("../js/game.js");
const { Roast, ROAST_LINES, ROAST_FINAL } = require("../js/roast.js");

const PLAYERS = [{ id: "p1", name: "Rob" }, { id: "p2", name: "Sam" }, { id: "p3", name: "Josh" }];

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Build a game whose rounds are exactly as specified — the ladder is irrelevant
// to what Roast looks at, and scripting real hands for every trigger would bury
// the assertions.
function gameOf(rounds, players = PLAYERS) {
  const g = Game.create({ players, gameType: "half", now: 1000 });
  g.rounds = rounds.map((spec, i) => {
    const scores = {};
    for (const p of players) scores[p.id] = Rules.score(spec.bids[p.id], spec.tricks[p.id]);
    return {
      number: i + 1,
      cards: spec.cards != null ? spec.cards : players.reduce((t, p) => t + spec.tricks[p.id], 0),
      bids: { ...spec.bids },
      tricks: { ...spec.tricks },
      scores,
    };
  });
  return g;
}

const keysAt = (g, i) => Roast.events(g, i).map((e) => e.key);

test("no events for a round that hasn't happened", () => {
  assert.deepStrictEqual(Roast.events(gameOf([]), 0), []);
});

test("everyone making it is the headline", () => {
  const g = gameOf([{ bids: { p1: 0, p2: 0, p3: 1 }, tricks: { p1: 0, p2: 0, p3: 1 } }]);
  assert.strictEqual(keysAt(g, 0)[0], "cleanSweep");
});

test("nobody making it is the other headline", () => {
  const g = gameOf([{ bids: { p1: 2, p2: 2, p3: 2 }, tricks: { p1: 3, p2: 0, p3: 0 } }]);
  assert.strictEqual(keysAt(g, 0)[0], "carnage");
});

test("a made zero only counts once there are cards worth taking", () => {
  const big = gameOf([{ bids: { p1: 0, p2: 1, p3: 3 }, tricks: { p1: 0, p2: 0, p3: 3 } }]);
  assert.ok(keysAt(big, 0).includes("zeroHero"));

  // Same bid on a one-card hand is just arithmetic, so it's only "perfect".
  const tiny = gameOf([{ bids: { p1: 0, p2: 1, p3: 1 }, tricks: { p1: 0, p2: 1, p3: 0 } }]);
  assert.ok(!keysAt(tiny, 0).includes("zeroHero"));
  assert.ok(keysAt(tiny, 0).includes("perfect"));
});

test("a big call made is called out, a small one is not", () => {
  const g = gameOf([{ bids: { p1: 6, p2: 1, p3: 0 }, tricks: { p1: 6, p2: 0, p3: 1 } }]);
  const ev = Roast.events(g, 0);
  assert.strictEqual(ev[0].key, "bigCall");
  assert.strictEqual(ev[0].name, "Rob");
});

test("missing by miles beats being merely wrong", () => {
  // The other two make theirs, or the round is "carnage" and outranks this.
  const g = gameOf([{ bids: { p1: 5, p2: 2, p3: 2 }, tricks: { p1: 1, p2: 2, p3: 2 } }]);
  const ev = Roast.events(g, 0);
  assert.strictEqual(ev[0].key, "miles");
  assert.strictEqual(ev[0].name, "Rob");
});

test("three rounds of overbidding is a habit worth mentioning", () => {
  const over = { bids: { p1: 2, p2: 0, p3: 0 }, tricks: { p1: 1, p2: 1, p3: 1 } };
  const g = gameOf([over, over, over]);
  const ev = Roast.events(g, 2).filter((e) => e.key === "overbidStreak");
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].name, "Rob");
  assert.ok(!keysAt(g, 1).includes("overbidStreak"), "two rounds isn't a streak");
});

test("three rounds of quietly overdelivering is the other habit", () => {
  const under = { bids: { p1: 0, p2: 2, p3: 0 }, tricks: { p1: 2, p2: 0, p3: 1 } };
  const g = gameOf([under, under, under]);
  assert.ok(keysAt(g, 2).includes("sandbagStreak"));
});

test("taking the lead is noticed, holding it is not", () => {
  const g = gameOf([
    { bids: { p1: 0, p2: 1, p3: 3 }, tricks: { p1: 0, p2: 0, p3: 3 } },   // 10, -5, 13
    { bids: { p1: 3, p2: 0, p3: 1 }, tricks: { p1: 3, p2: 0, p3: 0 } },   // 23, 5, 8
    { bids: { p1: 2, p2: 0, p3: 0 }, tricks: { p1: 2, p2: 0, p3: 0 } },   // 35, 15, 18
  ]);
  const lead = Roast.events(g, 1).find((e) => e.key === "newLeader");
  assert.ok(lead, "the lead changed hands");
  assert.strictEqual(lead.name, "Rob");
  assert.ok(!keysAt(g, 2).includes("newLeader"), "same leader, no news");
});

test("a line always comes out fully filled in", () => {
  const g = gameOf([
    { bids: { p1: 5, p2: 0, p3: 0 }, tricks: { p1: 1, p2: 2, p3: 2 } },
    { bids: { p1: 0, p2: 0, p3: 3 }, tricks: { p1: 0, p2: 0, p3: 3 } },
    { bids: { p1: 2, p2: 1, p3: 0 }, tricks: { p1: 2, p2: 1, p3: 0 } },
  ]);
  const roaster = Roast.make(seeded(42));
  for (let i = 0; i < g.rounds.length; i++) {
    const line = roaster.round(g, i);
    assert.ok(line, "round " + i + " had nothing to say");
    assert.ok(!/[{}]/.test(line), "unfilled placeholder in: " + line);
  }
});

test("a gag doesn't repeat until its bank is spent", () => {
  // Every round is a clean sweep, so every line comes from the same bank.
  const sweep = { bids: { p1: 0, p2: 0, p3: 1 }, tricks: { p1: 0, p2: 0, p3: 1 } };
  const bank = ROAST_LINES.cleanSweep.length;
  const g = gameOf(Array.from({ length: bank * 2 }, () => sweep));
  const roaster = Roast.make(seeded(7));

  const first = [];
  for (let i = 0; i < bank; i++) first.push(roaster.round(g, i));
  assert.strictEqual(new Set(first).size, bank, "the bank repeated itself early");

  const second = [];
  for (let i = bank; i < bank * 2; i++) second.push(roaster.round(g, i));
  assert.strictEqual(new Set(second).size, bank, "the refilled bank repeated itself");
});

test("the final screen names the winner and the wooden spoon", () => {
  const g = gameOf([{ bids: { p1: 2, p2: 0, p3: 0 }, tricks: { p1: 2, p2: 0, p3: 0 } }]);
  Game.finish(g, 9000);
  const lines = Roast.make(seeded(3)).final(g);

  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].includes("Rob"), lines[0]);
  assert.ok(!/[{}]/.test(lines.join(" ")));
});

test("a tie at the top gets its own line and no gloating", () => {
  const g = gameOf([{ bids: { p1: 1, p2: 1, p3: 0 }, tricks: { p1: 1, p2: 1, p3: 0 } }]);
  g.rounds[0].scores = { p1: 11, p2: 11, p3: 4 };
  Game.finish(g, 9000);
  const lines = Roast.make(seeded(5)).final(g);
  assert.ok(ROAST_FINAL.winnerTie.includes(lines[0]));
});

test("heads-up games skip the last-place joke", () => {
  const two = [{ id: "p1", name: "Rob" }, { id: "p2", name: "Sam" }];
  const g = gameOf([{ bids: { p1: 1, p2: 0 }, tricks: { p1: 1, p2: 0 } }], two);
  Game.finish(g, 9000);
  const lines = Roast.make(seeded(11)).final(g);
  assert.strictEqual(lines.length, 1, "coming second out of two is punishment enough");
});

test("every line in every bank uses only placeholders we can fill", () => {
  const allowed = new Set(["name", "points"]);
  const banks = { ...ROAST_LINES, ...ROAST_FINAL };

  for (const key in banks) {
    assert.ok(banks[key].length >= 2, key + " needs more than one line to be a bag");
    assert.strictEqual(new Set(banks[key]).size, banks[key].length, key + " repeats a line");

    for (const line of banks[key]) {
      for (const m of line.matchAll(/\{(\w+)\}/g))
        assert.ok(allowed.has(m[1]), key + " uses unknown placeholder {" + m[1] + "}");
      assert.ok(line.length <= 90, key + " line is too long for one glance: " + line);
    }
  }
});
