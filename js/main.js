// Up & Down the River · wiring.
//
// One rule runs through all of this: the fastest possible path from "the round
// is over" to "the app is ready for the next one". Every screen has exactly one
// obvious next action, and the number you are being asked for is always the
// biggest thing on the display.

// The kit's default click is a 50ms sine at volume 0.1, which vanishes under
// four people arguing about who reneged. These are the same idea, louder, and
// still quiet enough to live with for nineteen rounds.
Object.assign(GK.Sfx, {
  tap() { this.tone({ freq: 520, type: "sine", dur: 0.05, vol: 0.12 }); },
  pick() {
    this.tone({ freq: 640, type: "sine", dur: 0.05, vol: 0.14 });
    this.tone({ freq: 960, type: "sine", dur: 0.07, vol: 0.08, when: 0.03 });
  },
  made() {
    this.tone({ freq: 660, type: "triangle", dur: 0.1, vol: 0.16 });
    this.tone({ freq: 990, type: "triangle", dur: 0.16, vol: 0.13, when: 0.08 });
  },
  missed() { this.tone({ freq: 220, type: "sawtooth", dur: 0.22, vol: 0.12, slide: -70 }); },
  deal() {
    this.noise({ dur: 0.07, vol: 0.05 });
    this.tone({ freq: 320, type: "triangle", dur: 0.08, vol: 0.14 });
  },
});

const App = {
  settings: null,
  game: null,          // the game in progress, or null
  roaster: null,       // remembers which jokes it has already used this game
  undos: [],
  cursor: 0,           // which player the picker is asking
  setup: { picked: [], gameType: "full" },
  editing: null,       // { index, bids, tricks } while correcting a round
  viewing: null,       // a finished game being looked at
  fromHistory: false,
  profileId: null,

  init() {
    this.settings = Store.settings();
    GK.Sfx.enabled = this.settings.sound;

    const live = Store.current();
    if (live && live.stage !== "done") {
      this.game = live;
      this.roaster = Roast.make();
    } else if (live) {
      this.archive(live);           // finished last time but never filed
    }

    this.drawLadder();
    this.home();

    // A browser refuses to start an AudioContext outside a user gesture, and
    // iOS suspends it again whenever the app is backgrounded — so this listener
    // stays attached rather than firing once. init() is idempotent.
    const unlock = () => GK.Sfx.init();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    // Number keys drive the picker, which is mostly a gift to whoever is
    // testing this on a laptop.
    document.addEventListener("keydown", (e) => {
      if (GK.UI.screen !== "game" || !this.game) return;
      if (this.game.stage !== "bid" && this.game.stage !== "tally") return;
      if (e.key >= "0" && e.key <= "9") this.pick(+e.key);
    });

    GK.initPWA({ appName: "Up & Down the River" });
  },

  /* ===== chrome ============================================================ */

  drawLadder() {
    const heights = Rules.ladder("full", 4);
    const top = Math.max(...heights);
    GK.UI.el("home-ladder").innerHTML = heights
      .map((h) => `<i class="${h === top ? "top" : ""}" style="height:${Math.round((h / top) * 100)}%"></i>`)
      .join("");
  },

  home() {
    const g = Store.current();
    const slot = GK.UI.el("resume-slot");

    if (g && g.stage !== "done") {
      const names = g.players.map((p) => p.name).join(", ");
      slot.innerHTML = `
        <div class="panel tap" onclick="App.resume()">
          <h3>Carry on — round ${Game.roundNumber(g)} of ${Game.roundCount(g)}</h3>
          <p>${GK.util.esc(names)}</p>
        </div>`;
    } else {
      slot.innerHTML = "";
    }

    GK.UI.showScreen("home");
  },

  resume() {
    this.game = Store.current();
    if (!this.game) return this.home();
    if (!this.roaster) this.roaster = Roast.make();
    this.showGame();
  },

  save() { if (this.game) Store.setCurrent(this.game); },

  pushUndo() {
    if (!this.game) return;
    this.undos.push(Game.clone(this.game));
    if (this.undos.length > 30) this.undos.shift();
  },

  undo() {
    if (!this.undos.length) return;
    this.game = this.undos.pop();
    this.save();
    this.cursor = 0;
    GK.UI.toast("Undone");
    this.showGame();
  },

  toggle(key) {
    this.settings[key] = !this.settings[key];
    Store.saveSettings(this.settings);
    GK.Sfx.enabled = this.settings.sound;
    GK.Sfx.tap();
    this.paintSettings();
  },

  paintSettings() {
    const set = (id, on) => GK.UI.el(id).setAttribute("aria-checked", on ? "true" : "false");
    set("tog-roast", this.settings.roast);
    set("tog-sound", this.settings.sound);
    set("tog-confirm", this.settings.confirm);
  },

  showSettings() {
    this.paintSettings();
    const games = Store.games().length;
    GK.UI.el("settings-note").textContent =
      `${games} game${games === 1 ? "" : "s"} and ${Store.players().length} player${Store.players().length === 1 ? "" : "s"} saved on this device. Nothing leaves it.`;
    GK.UI.showScreen("settings");
  },

  // A yes/no sheet. Skipped entirely when the setting is off and the caller
  // says it's skippable — abandoning a game always asks.
  confirm({ title, text, ok = "Yes", danger = false, skippable = true, then }) {
    if (skippable && !this.settings.confirm) return then();
    GK.UI.el("confirm-title").textContent = title;
    GK.UI.el("confirm-text").textContent = text;
    const btn = GK.UI.el("confirm-ok");
    btn.textContent = ok;
    btn.className = danger ? "btn danger" : "btn";
    btn.onclick = () => { GK.UI.closeModal("modal-confirm"); then(); };
    GK.UI.openModal("modal-confirm");
  },

  /* ===== setting up a game ================================================= */

  newGame() {
    if (this.game) {
      return this.confirm({
        title: "Start a new game?",
        text: "The game in progress will be abandoned and won't be saved to history.",
        ok: "Abandon and start fresh",
        danger: true,
        skippable: false,
        then: () => { this.dropGame(); this.openSetup(); },
      });
    }
    this.openSetup();
  },

  openSetup() {
    this.setup.picked = [];
    this.setup.gameType = "full";
    this.renderSetup();
    GK.UI.showScreen("setup");
  },

  renderSetup() {
    const roster = Store.roster();
    const games = Store.games();
    const picked = this.setup.picked;

    GK.UI.el("setup-roster").innerHTML = roster.length ? roster.map((p) => {
      const at = picked.indexOf(p.id);
      const s = Stats.playerStats(games, p.id);
      const meta = s.played ? `${s.played} game${s.played === 1 ? "" : "s"} · ${s.won} won` : "new player";
      return `<button class="pick ${at >= 0 ? "on" : ""}" onclick="App.togglePick('${p.id}')">
                <span class="seat">${at >= 0 ? at + 1 : "+"}</span>
                <span class="pname">${GK.util.esc(p.name)}<span class="pmeta" style="display:block">${meta}</span></span>
              </button>`;
    }).join("") : `<p class="empty">No players yet. Add whoever's at the table — you only ever do this once each.</p>`;

    const n = picked.length;
    const canStart = n >= 2;
    GK.UI.el("btn-start").disabled = !canStart;
    GK.UI.el("setup-count").innerHTML = canStart
      ? `<b>${n} players</b> · ${Rules.ladderLabel(this.setup.gameType, n)}`
      : "Pick at least two players";

    // The ladder label depends on how many are playing, so both buttons have to
    // be relabelled every time somebody joins or leaves.
    const forLabel = Math.max(n, 2);
    GK.UI.el("lbl-full").textContent = Rules.ladderLabel("full", forLabel);
    GK.UI.el("lbl-half").textContent = Rules.ladderLabel("half", forLabel);
    document.querySelectorAll("#setup-length button").forEach((b) =>
      b.classList.toggle("on", b.dataset.type === this.setup.gameType));

    const peak = Rules.peak(forLabel);
    GK.UI.el("setup-note").textContent = peak < Rules.MAX_CARDS
      ? `${forLabel} players is ${peak} cards each at the top — one deck won't stretch to ten.`
      : "";
  },

  togglePick(id) {
    const at = this.setup.picked.indexOf(id);
    if (at >= 0) this.setup.picked.splice(at, 1);
    else if (this.setup.picked.length < 8) this.setup.picked.push(id);
    else return GK.UI.toast("Eight is plenty");
    GK.Sfx.tap();
    this.renderSetup();
  },

  setLength(type) {
    this.setup.gameType = type;
    GK.Sfx.tap();
    this.renderSetup();
  },

  startGame() {
    const all = Store.players();
    const players = this.setup.picked.map((id) => all.find((p) => p.id === id)).filter(Boolean);
    if (players.length < 2) return;

    Store.touch(players.map((p) => p.id));
    this.game = Game.create({ players, gameType: this.setup.gameType });
    this.roaster = Roast.make();
    this.undos = [];
    this.cursor = 0;
    this.save();
    GK.Sfx.deal();
    this.showGame();
  },

  /* ===== adding and editing players ======================================== */

  askNewPlayer(id) {
    this.namingId = id || null;
    const p = id ? Store.players().find((x) => x.id === id) : null;
    GK.UI.el("name-title").textContent = p ? "Rename player" : "Add a player";
    const input = GK.UI.el("name-input");
    input.value = p ? p.name : "";
    GK.UI.openModal("modal-name");
    setTimeout(() => input.focus(), 50);
  },

  saveName() {
    const name = GK.UI.el("name-input").value.trim();
    if (!name) return GK.UI.toast("Needs a name");
    GK.UI.closeModal("modal-name");

    if (this.namingId) {
      Store.renamePlayer(this.namingId, name);
      if (GK.UI.screen === "profile") this.showProfile(this.namingId);
      else this.showPlayers();
      return;
    }

    const p = Store.addPlayer(name);
    GK.Sfx.pick();
    if (GK.UI.screen === "setup") {
      if (p && !this.setup.picked.includes(p.id) && this.setup.picked.length < 8) this.setup.picked.push(p.id);
      this.renderSetup();
    } else {
      this.showPlayers();
    }
  },

  /* ===== the game screen =================================================== */

  showGame() {
    const g = this.game;
    if (!g) return this.home();
    if (g.stage === "done") return this.showFinal(g);

    // Ask whoever hasn't answered yet, so resuming lands in the right place.
    const vals = g.stage === "tally" ? g.tricks : g.bids;
    const waiting = g.players.findIndex((p) => vals[p.id] == null);
    if (waiting >= 0) this.cursor = waiting;
    this.cursor = Math.min(this.cursor, g.players.length - 1);

    GK.UI.el("g-round").textContent = `Round ${Game.roundNumber(g)} of ${Game.roundCount(g)}`;
    const cards = Game.cards(g);
    GK.UI.el("g-cards").textContent = `${cards} card${cards === 1 ? "" : "s"} each`;

    const view = { bid: this.viewBid, play: this.viewPlay, tally: this.viewTally, result: this.viewResult }[g.stage];
    const { body, foot } = view.call(this, g);
    GK.UI.el("g-body").innerHTML = body;
    GK.UI.el("g-foot").innerHTML = foot;

    GK.UI.showScreen("game");
  },

  // The strip of everyone's answers so far. Tap a name to go back to it.
  whoStrip(g, values) {
    return `<div class="who">${g.players.map((p, i) => {
      const v = values[p.id];
      return `<button class="${i === this.cursor ? "on" : v != null ? "done" : ""}" onclick="App.jumpTo(${i})">
                <span class="who-name">${GK.util.esc(p.name)}</span>
                <span class="n ${v == null ? "none" : ""}">${v == null ? "–" : v}</span>
              </button>`;
    }).join("")}</div>`;
  },

  chipRow(cards, chosen, disabled) {
    const few = cards <= 4 ? " few" : "";
    let html = `<div class="chips${few}">`;
    for (let n = 0; n <= cards; n++) {
      const off = disabled ? disabled(n) : false;
      html += `<button class="chip ${n === chosen ? "on" : ""}" ${off ? "disabled" : ""} onclick="App.pick(${n})">${n}</button>`;
    }
    return html + "</div>";
  },

  viewBid(g) {
    const cards = Game.cards(g);
    const who = g.players[this.cursor];
    const inCount = g.players.filter((p) => g.bids[p.id] != null).length;
    const all = Game.bidsIn(g);

    const body = this.whoStrip(g, g.bids) + `
      <div class="asking">
        <div class="name">${GK.util.esc(who.name)}</div>
        <div class="what">how many tricks?</div>
      </div>` + this.chipRow(cards, g.bids[who.id], null);

    const note = all
      ? `<p class="foot-note">${this.gapNote(g)}</p>`
      : `<p class="foot-note"><b>${inCount}</b> of ${g.players.length} bids in</p>`;

    return {
      body,
      foot: note + `<button class="btn wide" ${all ? "" : "disabled"} onclick="App.toPlay()">Everyone's in — play the round</button>`,
    };
  },

  // How the table's bids sit against the tricks actually going. Overbid is the
  // interesting case: somebody in that list cannot possibly make it.
  gapNote(g) {
    const cards = Game.cards(g);
    const gap = Game.bidGap(g);
    if (gap > 0) return `<b>${Game.bidTotal(g)} bid for ${cards}</b> — ${gap} of you can't make it`;
    if (gap < 0) return `<b>${Game.bidTotal(g)} bid for ${cards}</b> — ${-gap} trick${gap === -1 ? "" : "s"} going spare`;
    return `<b>Exactly ${cards} bid</b> — everyone could still make this`;
  },

  viewPlay(g) {
    const totals = Game.totals(g);

    const body = `<div class="rows">${g.players.map((p) => `
      <div class="prow">
        <div>
          <div class="nm">${GK.util.esc(p.name)}</div>
          <div class="sub">${totals[p.id]} so far</div>
        </div>
        <div class="big">${g.bids[p.id]}<small>bid</small></div>
      </div>`).join("")}</div>`;

    const note = `<p class="foot-note">${this.gapNote(g)}</p>`;

    return {
      body,
      foot: note + `<button class="btn wide" onclick="App.toTally()">Round played — enter tricks</button>
                    <button class="btn ghost wide" onclick="App.backToBids()">Fix a bid</button>`,
    };
  },

  viewTally(g) {
    const cards = Game.cards(g);
    const who = g.players[this.cursor];
    const got = Game.tricksTotal(g);
    const others = got - (g.tricks[who.id] || 0);
    const everyone = g.players.every((p) => g.tricks[p.id] != null);
    const ready = Game.tricksIn(g);

    const body = this.whoStrip(g, g.tricks) + `
      <div class="asking">
        <div class="name">${GK.util.esc(who.name)}</div>
        <div class="what">bid ${g.bids[who.id]} — how many did they take?</div>
      </div>` +
      // On the way round for the first time, a number that would put more
      // tricks on the table than were dealt is greyed out — which also means
      // the last player's answer is usually the only chip still lit. Once
      // somebody has an answer, correcting it is unconstrained: fixing Sam
      // shouldn't require fixing Rob first.
      this.chipRow(cards, g.tricks[who.id], (n) => g.tricks[who.id] == null && others + n > cards);

    let note;
    if (!everyone) note = `<p class="foot-note">Tricks entered: <b>${got}</b> of ${cards}</p>`;
    else if (!ready) note = `<p class="foot-note warn">That's ${got} of ${cards} — ${got > cards ? "one too many somewhere" : `${cards - got} still to place`}</p>`;
    else note = `<p class="foot-note">All ${cards} accounted for</p>`;

    return {
      body,
      foot: note + `<button class="btn wide" ${ready ? "" : "disabled"} onclick="App.submitRound()">Score the round</button>`,
    };
  },

  viewResult(g) {
    const r = g.rounds[g.round];
    const standings = Game.standings(g);
    const last = Game.roundNumber(g) === Game.roundCount(g);

    const body = `<div class="rows">${standings.map((s) => {
      const bid = r.bids[s.id], took = r.tricks[s.id], pts = r.scores[s.id];
      const made = bid === took;
      return `<div class="prow ${made ? "made perfect" : "missed"} ${s.rank === 1 ? "lead" : ""}">
        <div>
          <div class="nm">${s.rank}. ${GK.util.esc(s.name)} ${made ? '<span class="tick">✓</span>' : ""}</div>
          <div class="sub">bid ${bid} · took ${took}</div>
        </div>
        <div class="res">
          <span class="delta ${pts >= 0 ? "up" : "down"}">${pts >= 0 ? "+" : ""}${pts}</span>
          <span class="tot">${s.total}</span>
          <span class="lbl">round</span>
          <span class="lbl">total</span>
        </div>
      </div>`;
    }).join("")}</div>` + this.roastLine(g);

    return {
      body,
      foot: `<button class="btn wide" onclick="App.nextRound()">${last ? "Final results" : "Next round"}</button>`,
    };
  },

  roastLine(g) {
    if (!this.settings.roast || !this.roaster) return "";
    const line = this.roaster.round(g, g.round);
    return line ? `<p class="roast">${GK.util.esc(line)}</p>` : "";
  },

  /* ===== moving the round along ============================================ */

  jumpTo(i) { this.cursor = i; GK.Sfx.tap(); this.showGame(); },

  pick(n) {
    const g = this.game;
    if (!g) return;
    const cards = Game.cards(g);
    if (n > cards) return;

    const who = g.players[this.cursor];
    if (g.stage === "bid") {
      this.pushUndo();
      Game.setBid(g, who.id, n);
    } else if (g.stage === "tally") {
      const others = Game.tricksTotal(g) - (g.tricks[who.id] || 0);
      if (g.tricks[who.id] == null && others + n > cards) return;
      this.pushUndo();
      Game.setTricks(g, who.id, n);
    } else {
      return;
    }

    GK.Sfx.pick();
    // Hop to the next player still to answer, wrapping round, and stay put once
    // everybody has — so a correction doesn't jump away from what you're fixing.
    const vals = g.stage === "tally" ? g.tricks : g.bids;
    const from = this.cursor;
    for (let k = 1; k <= g.players.length; k++) {
      const at = (from + k) % g.players.length;
      if (vals[g.players[at].id] == null) { this.cursor = at; break; }
    }
    this.save();
    this.showGame();
  },

  toPlay() { this.pushUndo(); Game.toPlay(this.game); GK.Sfx.deal(); this.save(); this.showGame(); },
  backToBids() { this.pushUndo(); Game.toBids(this.game); this.cursor = 0; this.save(); this.showGame(); },
  toTally() { this.pushUndo(); Game.toTally(this.game); this.cursor = 0; this.save(); this.showGame(); },

  submitRound() {
    const g = this.game;
    this.pushUndo();
    Game.submit(g);
    if (g.stage !== "result") return;

    const r = g.rounds[g.round];
    const madeAny = g.players.some((p) => r.bids[p.id] === r.tricks[p.id]);
    if (madeAny) GK.Sfx.made(); else GK.Sfx.missed();

    this.save();
    this.showGame();
  },

  nextRound() {
    const g = this.game;
    this.pushUndo();
    Game.next(g);
    this.cursor = 0;
    if (Game.isDone(g)) return this.finishGame();
    GK.Sfx.deal();
    this.save();
    this.showGame();
  },

  /* ===== the game menu ===================================================== */

  openGameMenu() {
    const g = this.game;
    if (!g) return;
    const toHalf = Game.canConvert(g, "half");
    const toFull = Game.canConvert(g, "full");

    GK.UI.el("menu-list").innerHTML = `
      <button ${this.undos.length ? "" : "disabled"} onclick="App.menu('undo')">↩︎ Undo the last change</button>
      <button onclick="App.menu('scores')">📋 Score sheet</button>
      ${toHalf ? `<button onclick="App.menu('half')">Make this a half game <small>(stop at ${Game.peak(g)})</small></button>` : ""}
      ${toFull ? `<button onclick="App.menu('full')">Make this a full game <small>(and back down again)</small></button>` : ""}
      <button onclick="App.menu('end')">Finish here and score it</button>
      <button onclick="App.menu('later')">Leave it for later</button>
      <button class="warn" onclick="App.menu('abandon')">Abandon this game</button>`;
    GK.UI.openModal("modal-menu");
  },

  menu(what) {
    GK.UI.closeModal("modal-menu");
    const g = this.game;

    if (what === "undo") return this.undo();
    if (what === "scores") return this.showScores();
    if (what === "later") return this.home();

    if (what === "half" || what === "full") {
      const half = what === "half";
      return this.confirm({
        title: half ? "Change this to a half game?" : "Change this to a full game?",
        text: half
          ? `The game will finish at the top of the ladder instead of coming back down. Every score so far is kept.`
          : `The ladder will climb to ${Game.peak(g)} and come back down again. Every score so far is kept.`,
        ok: "Change it",
        then: () => {
          this.pushUndo();
          Game.convert(g, what);
          this.save();
          GK.UI.toast(half ? "Half game — finishing at the top" : "Full game — all the way back down");
          if (Game.isDone(g)) this.finishGame(); else this.showGame();
        },
      });
    }

    if (what === "end") {
      if (!g.rounds.length) return this.menu("abandon");
      return this.confirm({
        title: "Finish the game here?",
        text: `${Game.roundNumber(g) - (g.stage === "result" ? 0 : 1)} rounds played. It'll be scored as it stands and saved to history.`,
        ok: "Finish and score it",
        then: () => { Game.finish(g); this.finishGame(); },
      });
    }

    if (what === "abandon") {
      return this.confirm({
        title: "Abandon this game?",
        text: "It won't be saved and it won't count towards anybody's record.",
        ok: "Abandon it",
        danger: true,
        skippable: false,
        then: () => { this.dropGame(); this.home(); },
      });
    }
  },

  dropGame() {
    this.game = null;
    this.roaster = null;
    this.undos = [];
    Store.clearCurrent();
  },

  /* ===== finishing ========================================================= */

  finishGame() {
    const g = this.game;
    if (!g) return this.home();
    if (!g.completedAt) Game.finish(g);
    this.archive(g);
    GK.Sfx.win();
    this.showFinal(g);
  },

  archive(g) {
    if (g.rounds.length) Store.save(g);
    this.game = null;
    this.undos = [];
    Store.clearCurrent();
  },

  showFinal(g, fromHistory = false) {
    this.viewing = g;
    this.fromHistory = fromHistory;

    const rows = Game.standings(g);
    const winners = Game.winners(g);
    const h = Stats.highlights(g);
    const when = new Date(g.completedAt || g.createdAt);
    const cheer = winners.length > 1
      ? `${winners.map((w) => GK.util.esc(w.name)).join(" and ")}`
      : GK.util.esc(winners[0].name);

    const facts = [
      ["Rounds played", g.rounds.length],
      ["Game", g.gameType === "half" ? "Half — 1 up to the top" : "Full — up and back down"],
      ["Played", when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })],
      ["Players", GK.util.esc(g.players.map((p) => p.name).join(", "))],
    ];
    if (h.comeback) facts.push(["Biggest comeback", `${GK.util.esc(h.comeback.name)}, from ${h.comeback.points} behind`]);
    if (h.mostPerfect) facts.push(["Most bids made", `${GK.util.esc(h.mostPerfect.name)}, ${h.mostPerfect.n}`]);
    if (h.bestRound) facts.push(["Best round", `${GK.util.esc(h.bestRound.name)}, +${h.bestRound.points} in round ${h.bestRound.round}`]);
    if (h.worstRound) facts.push(["Worst round", `${GK.util.esc(h.worstRound.name)}, ${h.worstRound.points} in round ${h.worstRound.round}`]);

    const roasts = this.settings.roast ? Roast.make().final(g) : [];

    GK.UI.el("final-body").innerHTML = `
      <div class="trophy">
        <div class="cup">🏆</div>
        <div class="win">${cheer}</div>
        <div class="sub">${winners.length > 1 ? "share it, level on " : "wins with "}${rows[0].total}</div>
      </div>

      <div class="medals">${rows.map((r) => `
        <div class="medal ${r.rank === 1 ? "first" : ""}">
          <span class="pos">${r.rank}</span>
          <span class="nm">${GK.util.esc(r.name)}</span>
          <span class="pts">${r.total}</span>
        </div>`).join("")}
      </div>

      ${roasts.map((l) => `<p class="roast">${GK.util.esc(l)}</p>`).join("")}

      <div class="section-label">The game</div>
      <div class="facts">${facts.map(([k, v]) => `<div class="fact"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}</div>`;

    GK.UI.el("final-foot").innerHTML = `
      <button class="btn cream wide" onclick="App.showScores()">Score sheet</button>
      <button class="btn wide" onclick="${fromHistory ? "App.showHistory()" : "App.home()"}">${fromHistory ? "Back to history" : "Done"}</button>`;

    GK.UI.showScreen("final");
  },

  /* ===== the score sheet =================================================== */

  showScores() {
    const g = this.game || this.viewing;
    if (!g) return this.home();
    const live = g === this.game;

    const totals = Game.totals(g);
    const head = g.players.map((p) =>
      `<th>${GK.util.esc(p.name)}<span class="tot">${totals[p.id]}</span></th>`).join("");

    const rows = g.rounds.map((r, i) => `
      <tr ${live ? `onclick="App.editRound(${i})"` : ""}>
        <td class="rd">${r.number}<span class="bt">${r.cards} card${r.cards === 1 ? "" : "s"}</span></td>
        ${g.players.map((p) => {
          const pts = r.scores[p.id];
          return `<td><span class="pts ${pts >= 0 ? "up" : "down"}">${pts >= 0 ? "+" : ""}${pts}</span>
                      <span class="bt">${r.bids[p.id]}/${r.tricks[p.id]}</span></td>`;
        }).join("")}
      </tr>`).join("");

    GK.UI.el("scores-title").textContent = live ? "Score sheet" : "How it went";
    GK.UI.el("scores-grid").innerHTML = g.rounds.length
      ? `<thead><tr><th class="rd">Rd</th>${head}</tr></thead><tbody>${rows}</tbody>`
      : `<thead><tr><th class="rd">Rd</th>${head}</tr></thead>`;
    GK.UI.el("scores-hint").textContent = !g.rounds.length
      ? "Nothing scored yet."
      : live ? "Bid/tricks under each score. Tap a round to correct it."
             : "Bid/tricks under each score.";

    GK.UI.showScreen("scores");
  },

  closeScores() {
    if (this.game) return this.showGame();
    if (this.viewing) return this.showFinal(this.viewing, this.fromHistory);
    this.home();
  },

  /* ===== correcting a round ================================================ */

  editRound(i) {
    const r = this.game.rounds[i];
    if (!r) return;
    this.editing = { index: i, bids: { ...r.bids }, tricks: { ...r.tricks } };
    this.renderEdit();
    GK.UI.showScreen("edit");
  },

  renderEdit() {
    const g = this.game;
    const e = this.editing;
    const r = g.rounds[e.index];
    const total = g.players.reduce((t, p) => t + e.tricks[p.id], 0);
    const ok = total === r.cards;

    GK.UI.el("edit-title").textContent = `Round ${r.number} — ${r.cards} card${r.cards === 1 ? "" : "s"}`;

    GK.UI.el("edit-body").innerHTML = g.players.map((p) => {
      const step = (field, val) => `
        <div class="stepper">
          <span class="lbl">${field === "bids" ? "bid" : "took"}</span>
          <button ${val <= 0 ? "disabled" : ""} onclick="App.bump('${p.id}','${field}',-1)" aria-label="one fewer">−</button>
          <span class="val">${val}</span>
          <button ${val >= r.cards ? "disabled" : ""} onclick="App.bump('${p.id}','${field}',1)" aria-label="one more">+</button>
        </div>`;
      return `<div class="edit-row">
                <span class="nm">${GK.util.esc(p.name)}</span>
                ${step("bids", e.bids[p.id])}
                ${step("tricks", e.tricks[p.id])}
              </div>`;
    }).join("");

    GK.UI.el("edit-note").innerHTML = ok
      ? `Tricks add up to <b>${r.cards}</b>`
      : `<span class="warn">Tricks come to <b>${total}</b> — they have to make ${r.cards}</span>`;
    GK.UI.el("btn-save-edit").disabled = !ok;
  },

  bump(playerId, field, delta) {
    const e = this.editing;
    const r = this.game.rounds[e.index];
    e[field][playerId] = GK.util.clamp(e[field][playerId] + delta, 0, r.cards);
    GK.Sfx.tap();
    this.renderEdit();
  },

  saveEdit() {
    const e = this.editing;
    this.pushUndo();
    Game.editRound(this.game, e.index, e.bids, e.tricks);
    this.editing = null;
    this.save();
    GK.UI.toast("Round " + (e.index + 1) + " corrected");
    this.showScores();
  },

  cancelEdit() { this.editing = null; this.showScores(); },

  /* ===== players and history =============================================== */

  showPlayers() {
    const games = Store.games();
    const roster = Store.roster();

    GK.UI.el("players-body").innerHTML = roster.length ? roster.map((p) => {
      const s = Stats.playerStats(games, p.id);
      const meta = s.played
        ? `${s.played} game${s.played === 1 ? "" : "s"} · ${s.won} won · best ${s.highest}`
        : "hasn't played yet";
      return `<div class="panel tap" onclick="App.showProfile('${p.id}')">
                <h3>${GK.util.esc(p.name)}</h3>
                <p>${meta}</p>
              </div>`;
    }).join("") : `<p class="empty">Nobody here yet. Add the people you play with and the app will remember them.</p>`;

    GK.UI.showScreen("players");
  },

  showProfile(id) {
    this.profileId = id;
    const p = Store.players().find((x) => x.id === id);
    if (!p) return this.showPlayers();

    const games = Store.games();
    const s = Stats.playerStats(games, id);
    GK.UI.el("profile-name").textContent = p.name;

    const stat = (v, k, small) => `<div class="stat"><div class="v ${small ? "small" : ""}">${v}</div><div class="k">${k}</div></div>`;

    let html = s.played ? `
      <div class="stat-grid">
        ${stat(s.played, "games")}
        ${stat(s.won, "wins")}
        ${stat(s.winRate + "%", "win rate")}
        ${stat(s.highest, "highest")}
        ${stat(s.lowest, "lowest")}
        ${stat(s.average, "average", true)}
        ${stat(s.perfectBids, "bids made")}
        ${stat(s.perfectRate + "%", "of rounds")}
        ${stat(s.biggestComeback || "—", "comeback")}
      </div>
      <p class="tiny">Lowest score is in there deliberately. Somebody has to hold the record.</p>` : `
      <p class="empty">${GK.util.esc(p.name)} hasn't finished a game yet.</p>`;

    const mine = Stats.playedIn(games, id);
    if (mine.length) {
      html += `<div class="section-label">Games</div>` + mine.slice(0, 20).map((g) => {
        const pos = Stats.positionOf(g, id);
        const total = Game.totals(g)[id];
        const when = new Date(g.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
        return `<div class="panel tap" onclick="App.openHistoryGame('${g.id}')">
                  <h3>${pos === 1 ? "🏆 " : pos + ". "}${total}</h3>
                  <p>${when} · ${GK.util.esc(g.players.map((x) => x.name).join(", "))}</p>
                </div>`;
      }).join("");
    }

    GK.UI.el("profile-body").innerHTML = html;
    GK.UI.showScreen("profile");
  },

  openPlayerMenu() {
    const id = this.profileId;
    const p = Store.players().find((x) => x.id === id);
    if (!p) return;
    GK.UI.el("menu-list").innerHTML = `
      <button onclick="GK.UI.closeModal('modal-menu');App.askNewPlayer('${id}')">Rename ${GK.util.esc(p.name)}</button>
      <button class="warn" onclick="App.removePlayer('${id}')">Remove from the roster</button>`;
    GK.UI.openModal("modal-menu");
  },

  removePlayer(id) {
    GK.UI.closeModal("modal-menu");
    const p = Store.players().find((x) => x.id === id);
    this.confirm({
      title: `Remove ${p.name}?`,
      text: "Games they've already played stay in the history exactly as they were — they just won't show up when you're picking players.",
      ok: "Remove",
      danger: true,
      skippable: false,
      then: () => { Store.deletePlayer(id); this.showPlayers(); },
    });
  },

  showHistory() {
    const games = Stats.finished(Store.games());

    GK.UI.el("history-body").innerHTML = games.length ? games.map((g) => {
      const winners = Game.winners(g);
      const when = new Date(g.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      const scores = Game.standings(g).map((r) => `${GK.util.esc(r.name)} ${r.total}`).join(" · ");
      return `<div class="panel tap" onclick="App.openHistoryGame('${g.id}')">
                <h3>🏆 ${winners.map((w) => GK.util.esc(w.name)).join(" & ")}</h3>
                <p>${when} · ${g.gameType === "half" ? "Half" : "Full"} · ${g.rounds.length} rounds<br>${scores}</p>
              </div>`;
    }).join("") : `<p class="empty">No finished games yet. Play one and it'll turn up here.</p>`;

    GK.UI.showScreen("history");
  },

  openHistoryGame(id) {
    const g = Store.games().find((x) => x.id === id);
    if (g) this.showFinal(g, true);
  },
};

// Wait for the document to finish parsing before the first render — the picker
// sizes its chips off the stylesheet, and rendering mid-parse measures the
// wrong thing.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}
