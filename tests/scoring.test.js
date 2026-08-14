// The rules. Everything else in the app is presentation on top of these two
// numbers, so they are pinned first.

const test = require("node:test");
const assert = require("node:assert");

const { Rules } = require("../js/scoring.js");

test("a made bid scores ten plus the bid", () => {
  assert.strictEqual(Rules.score(0, 0), 10);
  assert.strictEqual(Rules.score(1, 1), 11);
  assert.strictEqual(Rules.score(2, 2), 12);
  assert.strictEqual(Rules.score(10, 10), 20);
});

test("a missed bid loses five a trick, over or under", () => {
  assert.strictEqual(Rules.score(2, 1), -5);
  assert.strictEqual(Rules.score(2, 3), -5);
  assert.strictEqual(Rules.score(4, 1), -15);
  assert.strictEqual(Rules.score(0, 3), -15);
});

test("over and under by the same amount cost the same", () => {
  for (let bid = 0; bid <= 10; bid++)
    for (let off = 1; off <= 3; off++)
      if (bid - off >= 0)
        assert.strictEqual(Rules.score(bid, bid + off), Rules.score(bid, bid - off));
});

test("the ladder peaks at ten for two to five players", () => {
  for (let n = 2; n <= 5; n++) assert.strictEqual(Rules.peak(n), 10);
});

test("the peak drops to what one deck can actually deal", () => {
  // 6 x 9 = 54 cards, which does not exist. Eight each is the honest maximum.
  assert.strictEqual(Rules.peak(6), 8);
  assert.strictEqual(Rules.peak(7), 7);
  assert.strictEqual(Rules.peak(8), 6);
});

test("a full ladder climbs and comes back down", () => {
  const l = Rules.ladder("full", 4);
  assert.strictEqual(l.length, 19);
  assert.strictEqual(l[0], 1);
  assert.strictEqual(l[9], 10);
  assert.strictEqual(l[18], 1);
  assert.deepStrictEqual(l.slice(0, 3), [1, 2, 3]);
  assert.deepStrictEqual(l.slice(-3), [3, 2, 1]);
});

test("a half ladder stops at the top", () => {
  assert.deepStrictEqual(Rules.ladder("half", 4), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("six players get a shorter ladder both ways", () => {
  const l = Rules.ladder("full", 6);
  assert.strictEqual(l.length, 15);
  assert.strictEqual(Math.max(...l), 8);
  assert.deepStrictEqual(Rules.ladder("half", 6), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("the ladder label says what the table is in for", () => {
  assert.strictEqual(Rules.ladderLabel("full", 4), "1 → 10 → 1");
  assert.strictEqual(Rules.ladderLabel("half", 4), "1 → 10");
  assert.strictEqual(Rules.ladderLabel("full", 6), "1 → 8 → 1");
});
