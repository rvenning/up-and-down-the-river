// Up & Down the River · local storage.
//
// Everything lives in localStorage under `river:`. No account, no sync, no
// analytics, nothing leaves the device — which is also why the game in progress
// is written after every single tap: this app has no other copy of the score,
// and a phone that dies mid-round has to come back with round six intact.

const Store = {
  P: "river:",
  GAME_CAP: 500,          // a full game is ~3KB; this is years of Sundays

  read(name, fallback) {
    try {
      const raw = localStorage.getItem(this.P + name);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      // Corrupt or unreadable storage must not brick the app at a table.
      console.warn("river: could not read " + name, e);
      return fallback;
    }
  },

  write(name, value) {
    try {
      localStorage.setItem(this.P + name, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("river: could not save " + name, e);
      return false;
    }
  },

  /* ----- players ---------------------------------------------------------- */

  players() { return this.read("players", []); },

  addPlayer(name) {
    name = String(name).trim().slice(0, 16);
    if (!name) return null;
    const players = this.players();
    const clash = players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (clash) return clash;

    const p = { id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
                name, createdAt: Date.now(), lastUsed: 0 };
    players.push(p);
    this.write("players", players);
    return p;
  },

  renamePlayer(id, name) {
    name = String(name).trim().slice(0, 16);
    if (!name) return;
    const players = this.players();
    const p = players.find((x) => x.id === id);
    if (!p) return;
    p.name = name;
    this.write("players", players);
    // Games keep the name they were played under on purpose — see Game.create.
  },

  deletePlayer(id) {
    this.write("players", this.players().filter((p) => p.id !== id));
  },

  // Bumped when a game starts, so the roster puts whoever plays most at the top
  // and the usual four are one tap each.
  touch(ids) {
    const players = this.players();
    const now = Date.now();
    for (const p of players) if (ids.includes(p.id)) p.lastUsed = now;
    this.write("players", players);
  },

  // Most recently played first, then most recently added.
  roster() {
    return this.players().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0) || b.createdAt - a.createdAt);
  },

  /* ----- games ------------------------------------------------------------ */

  games() { return this.read("games", []); },

  save(game) {
    const games = this.games().filter((g) => g.id !== game.id);
    games.push(game);
    games.sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    this.write("games", games.slice(-this.GAME_CAP));
  },

  removeGame(id) { this.write("games", this.games().filter((g) => g.id !== id)); },

  /* ----- the game in progress --------------------------------------------- */

  current() { return this.read("current", null); },
  setCurrent(g) { this.write("current", g); },
  clearCurrent() { localStorage.removeItem(this.P + "current"); },

  /* ----- settings ---------------------------------------------------------- */

  settings() {
    const s = this.read("settings", {});
    return { roast: true, sound: true, confirm: true, ...s };
  },
  saveSettings(s) { this.write("settings", s); },
};
