// Up & Down the River · statistics.
//
// Nothing here is stored. Every number is derived from the saved games on
// demand, which means a correction made to a game three weeks ago fixes the
// player's career record too, and there is no second copy of the truth to
// drift out of sync. There are only ever a few hundred games, so the cost of
// recomputing is nothing.
//
// No DOM, no globals, no GK — tests/stats.test.js runs this in a bare sandbox.

const GameRef = typeof require === "function" && typeof module !== "undefined"
  ? require("./game.js").Game
  : Game;

const Stats = {
  // Completed games only, newest first. An abandoned game never counts against
  // anybody's record.
  finished(games) {
    return games.filter((g) => g && g.completedAt).sort((a, b) => b.completedAt - a.completedAt);
  },

  playedIn(games, playerId) {
    return this.finished(games).filter((g) => g.players.some((p) => p.id === playerId));
  },

  playerStats(games, playerId) {
    const mine = this.playedIn(games, playerId);

    const s = {
      played: mine.length,
      won: 0,
      winRate: 0,
      highest: null,
      lowest: null,
      average: null,
      perfectBids: 0,
      roundsPlayed: 0,
      perfectRate: 0,
      bestPosition: null,
      biggestComeback: 0,
      lastPlayed: mine.length ? mine[0].completedAt : null,
    };
    if (!mine.length) return s;

    let sum = 0;
    for (const g of mine) {
      const totals = GameRef.totals(g);
      const final = totals[playerId];
      const position = this.positionOf(g, playerId);

      sum += final;
      if (s.highest === null || final > s.highest) s.highest = final;
      if (s.lowest === null || final < s.lowest) s.lowest = final;
      if (s.bestPosition === null || position < s.bestPosition) s.bestPosition = position;
      if (position === 1) {
        s.won++;
        s.biggestComeback = Math.max(s.biggestComeback, this.deficitFaced(g, playerId));
      }

      for (const r of g.rounds) {
        s.roundsPlayed++;
        if (r.bids[playerId] === r.tricks[playerId]) s.perfectBids++;
      }
    }

    s.average = Math.round((sum / mine.length) * 10) / 10;
    s.winRate = Math.round((s.won / s.played) * 1000) / 10;
    s.perfectRate = s.roundsPlayed ? Math.round((s.perfectBids / s.roundsPlayed) * 1000) / 10 : 0;
    return s;
  },

  // Where they finished. Level scores share a position, so two players on 87
  // are both second and nobody is third.
  positionOf(game, playerId) {
    const row = GameRef.standings(game).find((r) => r.id === playerId);
    return row ? row.rank : null;
  },

  // The most points this player was ever behind the leader at the end of a
  // round in this game. Paired with a win, that's a comeback.
  deficitFaced(game, playerId) {
    let worst = 0;
    for (let n = 1; n < game.rounds.length; n++) {
      const t = GameRef.totalsAfter(game, n);
      const best = Math.max(...game.players.map((p) => t[p.id]));
      worst = Math.max(worst, best - t[playerId]);
    }
    return worst;
  },

  // The three or four things worth putting on the final screen. Each one is
  // null when nothing interesting happened, so the screen can leave it out
  // rather than print "biggest comeback: 0".
  highlights(game) {
    const out = { comeback: null, mostPerfect: null, bestRound: null, worstRound: null };
    if (!game.rounds.length) return out;

    for (const w of GameRef.winners(game)) {
      const points = this.deficitFaced(game, w.id);
      if (points > 0 && (!out.comeback || points > out.comeback.points))
        out.comeback = { id: w.id, name: w.name, points };
    }

    for (const p of game.players) {
      const n = game.rounds.filter((r) => r.bids[p.id] === r.tricks[p.id]).length;
      if (!out.mostPerfect || n > out.mostPerfect.n) out.mostPerfect = { id: p.id, name: p.name, n };

      for (const r of game.rounds) {
        const cell = { id: p.id, name: p.name, points: r.scores[p.id], round: r.number };
        if (!out.bestRound || cell.points > out.bestRound.points) out.bestRound = cell;
        if (!out.worstRound || cell.points < out.worstRound.points) out.worstRound = cell;
      }
    }

    // A shared top of "one perfect bid each" isn't a highlight, and neither is
    // a best round that everybody matched.
    if (out.mostPerfect && out.mostPerfect.n < 2) out.mostPerfect = null;
    if (out.worstRound && out.worstRound.points >= 0) out.worstRound = null;
    return out;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Stats };
}
