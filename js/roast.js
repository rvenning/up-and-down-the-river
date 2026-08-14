// Up & Down the River · Roast Mode.
//
// One line, after the round is already scored, at the bottom of the results.
// It never blocks anything and it is never the reason a tap didn't register —
// that is the whole design brief. The jokes are about the bidding, not about
// the person: "you called four and took one" is fair game, everything else
// isn't.
//
// Lines are drawn from a bag per category, so the same gag can't land twice in
// one evening until the whole bank has had a turn.
//
// No DOM, no globals, no GK — tests/roast.test.js runs this in a bare sandbox.

const isNode = typeof require === "function" && typeof module !== "undefined";
const GameForRoast = isNode ? require("./game.js").Game : Game;
const StatsForRoast = isNode ? require("./stats.js").Stats : Stats;

const ROAST_LINES = {
  cleanSweep: [
    "Everybody made it. Suspicious. Nobody is this good.",
    "A full house of correct bids. Someone check the cards.",
    "Round of the century: not one of you got it wrong.",
  ],
  carnage: [
    "Not a single made bid. Beautiful work, all of you.",
    "Nobody got it. The cards win this round.",
    "A clean sweep of failure. Genuinely impressive.",
  ],
  zeroHero: [
    "{name} bid nothing and delivered nothing. Flawless.",
    "{name} promised to do absolutely nothing and followed through.",
    "{name} wins the round by refusing to participate.",
    "Zero called, zero taken. {name} contributes nothing and gains everything.",
  ],
  bigCall: [
    "{name} called it big and actually got there. Insufferable.",
    "Look who's suddenly a card-counting genius.",
    "{name} said a scary number out loud and then went and did it.",
    "Big bid, big delivery. {name} will be unbearable now.",
  ],
  miles: [
    "Bold prediction, {name}. Shame about the execution.",
    "{name} was not close. {name} was not in the postcode.",
    "That round has been officially removed from {name}'s résumé.",
    "{name}, that bid and that result have never met.",
  ],
  overbidStreak: [
    "Maybe next round try bidding the number of tricks you can actually win, {name}.",
    "Three rounds of overbidding. {name} is playing a different, braver game.",
    "{name} keeps writing cheques the hand can't cash.",
    "{name} has now overbid three times running. It's a lifestyle.",
  ],
  sandbagStreak: [
    "{name} keeps winning tricks nobody asked for.",
    "Three rounds under. {name}, you're allowed to bid what you're holding.",
    "{name} is undersell-and-overdeliver in card form, and it's costing points.",
    "Somebody tell {name} the aces still count.",
  ],
  basement: [
    "Congratulations to {name} on their commitment to the bottom of the leaderboard.",
    "{name} has made the cellar their own. Cosy down there?",
    "{name} is playing a long game. A very long game.",
    "Still last. {name} is nothing if not consistent.",
  ],
  climbing: [
    "Oh no. {name} is coming back.",
    "{name} has left the basement and is climbing the stairs.",
    "Everyone please note that {name} is no longer last, and is enjoying it.",
    "{name} remembered how to play. Awkward.",
  ],
  newLeader: [
    "{name} takes the lead. Savour it, these things pass.",
    "New leader: {name}. The rest of you should feel something about that.",
    "{name} is in front now, and will absolutely mention it.",
  ],
  disaster: [
    "{name} would like that round struck from the record.",
    "{name} took a proper beating there. We all saw it.",
    "Somewhere, {name}'s scoreline is still falling.",
    "{name} may want to sit the next one out. Emotionally.",
  ],
  perfect: [
    "{name} called it exactly. Show-off.",
    "Perfect bid for {name}. Nobody likes this.",
    "{name} said it and did it. Deeply irritating.",
    "Textbook from {name}. Put it away.",
  ],
};

const ROAST_FINAL = {
  winner: [
    "{name} wins, and will be telling people about it well into next week.",
    "{name} takes it. The rest of you were witnesses.",
    "Winner: {name}. Everyone act pleased.",
  ],
  winnerComeback: [
    "{name} was {points} behind and won anyway. That's just rude.",
    "{name} came back from {points} down. Somebody check the deck.",
    "Down {points}, up a trophy. {name} has no shame.",
  ],
  winnerTie: [
    "A tie at the top. Nobody gets to gloat properly and that's the real punishment.",
    "Level on points. You'll have to play again, which was always the plan.",
  ],
  spoon: [
    "{name} finishes last and takes the walk of shame to the kitchen.",
    "Last place: {name}. Somebody has to do it, and they really committed.",
    "{name} came bottom. On the plus side, it's over now.",
  ],
};

const Roast = {
  LINES: ROAST_LINES,
  FINAL: ROAST_FINAL,

  // Everything true about the round that's worth a joke, most interesting
  // first. The caller only ever uses the top one.
  events(game, i) {
    const r = game.rounds[i];
    if (!r) return [];

    const players = game.players;
    const before = i > 0 ? GameForRoast.standings(game, i) : null;
    const now = GameForRoast.standings(game, i + 1);
    const rankOf = (rows, id) => rows.find((x) => x.id === id).rank;
    const last = Math.max(...now.map((x) => x.rank));
    const made = players.filter((p) => r.bids[p.id] === r.tricks[p.id]);
    const out = [];
    const add = (key, name, priority, extra) => out.push({ key, name, priority, ...extra });

    if (players.length >= 3 && made.length === players.length) add("cleanSweep", null, 9);
    if (players.length >= 3 && made.length === 0) add("carnage", null, 8);

    for (const p of players) {
      const bid = r.bids[p.id], tricks = r.tricks[p.id], off = Math.abs(bid - tricks);

      if (bid === tricks) {
        // Calling nothing on a one-card hand isn't brave, it's arithmetic.
        if (bid === 0 && r.cards >= 3) add("zeroHero", p.name, 7);
        else if (bid >= 5) add("bigCall", p.name, 7);
        else add("perfect", p.name, 2);
      } else {
        if (off >= 4) add("miles", p.name, 6);
        else if (r.scores[p.id] <= -15) add("disaster", p.name, 4);
      }

      // Three rounds leaning the same way is a habit, not bad luck.
      if (i >= 2) {
        const three = game.rounds.slice(i - 2, i + 1);
        if (three.every((x) => x.bids[p.id] > x.tricks[p.id])) add("overbidStreak", p.name, 6);
        if (three.every((x) => x.bids[p.id] < x.tricks[p.id])) add("sandbagStreak", p.name, 6);
      }

      if (before) {
        const was = rankOf(before, p.id), is = rankOf(now, p.id);
        const wasLast = was === Math.max(...before.map((x) => x.rank));
        if (wasLast && is <= Math.ceil(players.length / 2) && players.length >= 3)
          add("climbing", p.name, 5);
      }

      // Last place three rounds running, and far enough in to be a verdict.
      if (i >= 3 && players.length >= 3) {
        const stuck = [i - 2, i - 1, i].every((n) => {
          const rows = GameForRoast.standings(game, n + 1);
          return rankOf(rows, p.id) === Math.max(...rows.map((x) => x.rank));
        });
        if (stuck && rankOf(now, p.id) === last) add("basement", p.name, 5);
      }
    }

    if (before && now[0].id !== before[0].id && now[0].rank === 1 && now[1].total !== now[0].total)
      add("newLeader", now[0].name, 4);

    return out.sort((a, b) => b.priority - a.priority);
  },

  // A roaster remembers what it has already said. One per game.
  make(rng = Math.random) {
    const bags = {};

    function draw(key, bank) {
      if (!bags[key] || !bags[key].length) bags[key] = bank.map((_, n) => n);
      const at = Math.floor(rng() * bags[key].length);
      const [pick] = bags[key].splice(at, 1);
      return bank[pick];
    }

    const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

    return {
      // One line for the round just scored, or null when nothing stood out.
      round(game, i) {
        const events = Roast.events(game, i);
        if (!events.length) return null;
        // Everything tied at the top priority is equally funny; pick among them
        // so the same player isn't singled out every single round.
        const top = events.filter((e) => e.priority === events[0].priority);
        const e = top[Math.floor(rng() * top.length)];
        return fill(draw(e.key, ROAST_LINES[e.key]), e);
      },

      // Two lines for the final screen: the winner, and whoever propped up the
      // table. In a two-player game those are the same joke twice, so only one.
      final(game) {
        const winners = GameForRoast.winners(game);
        const rows = GameForRoast.standings(game);
        const lines = [];

        if (winners.length > 1) {
          lines.push(draw("winnerTie", ROAST_FINAL.winnerTie));
        } else {
          const w = winners[0];
          const points = StatsForRoast.deficitFaced(game, w.id);
          if (points >= 15) lines.push(fill(draw("winnerComeback", ROAST_FINAL.winnerComeback), { name: w.name, points }));
          else lines.push(fill(draw("winner", ROAST_FINAL.winner), { name: w.name }));
        }

        const bottom = rows[rows.length - 1];
        if (game.players.length >= 3 && bottom.rank > 1)
          lines.push(fill(draw("spoon", ROAST_FINAL.spoon), { name: bottom.name }));

        return lines;
      },
    };
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Roast, ROAST_LINES, ROAST_FINAL };
}
