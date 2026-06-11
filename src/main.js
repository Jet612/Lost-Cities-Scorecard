import './style.css';

/* ------------------------------------------------------------------ *
 *  Lost Cities — Expedition Ledger
 *  Scoring rules (per expedition colour that has at least one card):
 *    1. Begin at -20 (the cost of mounting the expedition).
 *    2. Add the face value of every number card played (2–10).
 *    3. Multiply the running total by (handshakes + 1).
 *    4. If 8 or more cards were played, add a +20 bonus.
 *  An expedition with no cards scores nothing.
 *  A game is played over several rounds; the highest grand total wins.
 * ------------------------------------------------------------------ */

const NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const MAX_HANDSHAKES = 3;
const TOTAL_ROUNDS = 3;

const EXPEDITIONS = [
  { id: 'yellow', name: 'Yellow', glyph: 'Ⅰ' },
  { id: 'blue', name: 'Blue', glyph: 'Ⅱ' },
  { id: 'white', name: 'White', glyph: 'Ⅲ' },
  { id: 'green', name: 'Green', glyph: 'Ⅳ' },
  { id: 'red', name: 'Red', glyph: 'Ⅴ' },
  { id: 'purple', name: 'Purple', glyph: 'Ⅵ' },
];

/* ----------------------------- state ----------------------------- */

const STORAGE_KEY = 'lost-cities-ledger-v2';

const blankBoard = () =>
  Object.fromEntries(
    EXPEDITIONS.map((e) => [e.id, { handshakes: 0, numbers: {} }])
  );

const defaultState = () => ({
  players: [
    { name: 'Explorer I', board: blankBoard() },
    { name: 'Explorer II', board: blankBoard() },
  ],
  active: 0,
  sixth: false, // include the purple (6th) expedition
  round: 1, // 1-based current round
  totalRounds: TOTAL_ROUNDS,
  history: [], // history[r] = [scoreP0, scoreP1]
  phase: 'playing', // 'playing' | 'summary'
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    const merged = { ...base, ...parsed };
    if (!merged.players || merged.players.length !== 2) return base;
    merged.players.forEach((p) => {
      p.board = { ...blankBoard(), ...(p.board || {}) };
    });
    if (!Array.isArray(merged.history)) merged.history = [];
    // Normalise history entries to { scores, boards }. Older saves stored a
    // bare [scoreP0, scoreP1] array with no board snapshot.
    merged.history = merged.history.map((rec) =>
      Array.isArray(rec) ? { scores: rec, boards: null } : rec
    );
    return merged;
  } catch {
    return defaultState();
  }
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/* --------------------------- scoring ----------------------------- */

function scoreExpedition(cell) {
  const playedNumbers = Object.keys(cell.numbers)
    .filter((n) => cell.numbers[n])
    .map(Number);
  const cardCount = cell.handshakes + playedNumbers.length;

  if (cardCount === 0) {
    return { score: 0, cardCount: 0, sum: 0, multiplier: 1, bonus: 0, active: false };
  }

  const sum = playedNumbers.reduce((a, b) => a + b, 0);
  const multiplier = cell.handshakes + 1;
  let score = (sum - 20) * multiplier;
  const bonus = cardCount >= 8 ? 20 : 0;
  score += bonus;

  return { score, cardCount, sum, multiplier, bonus, active: true };
}

function activeExpeditions() {
  return EXPEDITIONS.filter((e) => e.id !== 'purple' || state.sixth);
}

function scoreBoard(board) {
  return activeExpeditions().reduce(
    (total, e) => total + scoreExpedition(board[e.id]).score,
    0
  );
}

/* Points already banked from completed rounds for a given player. */
function bankedTotal(playerIndex) {
  return state.history.reduce((sum, rec) => sum + rec.scores[playerIndex], 0);
}

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

/* --------------------------- helpers ----------------------------- */

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function expeditionDetail(result) {
  if (!result.active) return 'no cards';
  const mult = result.multiplier > 1 ? `×${result.multiplier} · ` : '';
  const cards = `${result.cardCount} card${result.cardCount === 1 ? '' : 's'}`;
  const bonus = result.bonus ? ' · +20' : '';
  return `${mult}${cards}${bonus}`;
}

function leaderOf(totals) {
  return totals[0] === totals[1] ? -1 : totals[0] > totals[1] ? 0 : 1;
}

/* --------------------------- rendering --------------------------- */

const app = document.getElementById('app');

function render() {
  if (state.phase === 'summary') renderSummary();
  else renderPlaying();
}

/* ---- playing phase ---- */

function renderPlaying() {
  const isFinalRound = state.round >= state.totalRounds;

  app.innerHTML = `
    <div class="grain" aria-hidden="true"></div>
    <main class="ledger">
      <header class="masthead">
        <div class="rule"><span class="diamond">◆</span></div>
        <p class="overline">An Archaeological Accounting</p>
        <h1>Lost Cities</h1>
        <p class="subtitle">Expedition Ledger &amp; Scorekeeper</p>
        <div class="rule"><span class="diamond">◆</span></div>
        <div class="round-status">
          <span class="round-dots">
            ${Array.from({ length: state.totalRounds }, (_, i) => {
              const cls = i + 1 < state.round ? 'done' : i + 1 === state.round ? 'current' : '';
              return `<span class="round-dot ${cls}"></span>`;
            }).join('')}
          </span>
          <span class="round-label">Round ${state.round} of ${state.totalRounds}</span>
        </div>
      </header>

      <section class="scoreboard">
        ${state.players.map((p, i) => playerTotalCard(p, i)).join('')}
      </section>

      <section class="controls">
        <div class="tabs" role="tablist">
          ${state.players
            .map(
              (p, i) => `
            <button class="tab ${state.active === i ? 'is-active' : ''}"
                    role="tab" data-tab="${i}">
              <span class="tab-dot"></span>${escapeHtml(p.name)}
            </button>`
            )
            .join('')}
        </div>
        <div class="control-buttons">
          <label class="switch" title="Include the 6th (Purple) expedition">
            <input type="checkbox" id="sixth-toggle" ${state.sixth ? 'checked' : ''} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label">6th Expedition</span>
          </label>
          <button class="ghost-btn" id="clear-btn">Clear Round</button>
        </div>
      </section>

      <section class="board">
        ${activeExpeditions()
          .map((e) => expeditionRow(e, state.players[state.active].board[e.id]))
          .join('')}
      </section>

      <section class="round-actions">
        ${state.history.length > 0 ? '<button class="minor-btn" id="prev-btn">← Previous Round</button>' : ''}
        <button class="primary-btn" id="finish-btn">
          ${isFinalRound ? 'Finish Game &amp; See Results' : `Finish Round ${state.round}`} →
        </button>
      </section>

      <footer class="colophon">
        <span>Begin every expedition at −20 · ×(handshakes + 1) · +20 at eight cards</span>
      </footer>
    </main>
  `;

  bindPlaying();
}

/* big number = whole-game total so far (banked rounds + live round) */
function bankedTotal_plusLive(player, index) {
  return bankedTotal(index) + scoreBoard(player.board);
}

function playerTotalCard(player, index) {
  const totals = state.players.map((p, i) => bankedTotal_plusLive(p, i));
  const leader = leaderOf(totals);
  const total = totals[index];
  const roundScore = scoreBoard(player.board);
  const isLeader = leader === index;
  const tie = leader === -1;

  return `
    <article class="total-card ${isLeader ? 'is-leader' : ''}" data-edit-player="${index}">
      <div class="total-card-head">
        <input class="name-input" value="${escapeHtml(player.name)}"
               data-name="${index}" spellcheck="false" maxlength="22" />
        ${isLeader ? '<span class="badge">Leading</span>' : tie ? '<span class="badge tie">Tied</span>' : ''}
      </div>
      <div class="total-value ${total < 0 ? 'is-neg' : ''}">${total}</div>
      <div class="total-sub">Round ${state.round} · <span class="round-delta">${signed(roundScore)}</span></div>
    </article>
  `;
}

function expeditionRow(exp, cell) {
  const result = scoreExpedition(cell);
  const handshakes = Array.from({ length: MAX_HANDSHAKES }, (_, i) => {
    const on = i < cell.handshakes;
    return `<button class="card card-hs ${on ? 'is-played' : ''}"
      data-exp="${exp.id}" data-hs="${i + 1}"
      title="Handshake / Wager card" aria-pressed="${on}">
      <span class="card-mark">⌘</span>
    </button>`;
  }).join('');

  const numbers = NUMBERS.map((n) => {
    const on = !!cell.numbers[n];
    return `<button class="card card-num ${on ? 'is-played' : ''}"
      data-exp="${exp.id}" data-num="${n}" aria-pressed="${on}">${n}</button>`;
  }).join('');

  const subtotalClass = !result.active ? 'idle' : result.score < 0 ? 'neg' : 'pos';

  return `
    <article class="exp" data-color="${exp.id}">
      <div class="exp-spine">
        <span class="exp-glyph">${exp.glyph}</span>
        <span class="exp-name">${exp.name}</span>
      </div>
      <div class="exp-cards">
        <div class="hs-group">${handshakes}</div>
        <div class="num-group">${numbers}</div>
      </div>
      <div class="exp-score ${subtotalClass}">
        <span class="exp-score-value">${result.active ? signed(result.score) : '—'}</span>
        <span class="exp-score-detail">${expeditionDetail(result)}</span>
      </div>
    </article>
  `;
}

/* ---- summary phase ---- */

function renderSummary() {
  const totals = state.players.map((_, i) => bankedTotal(i));
  const leader = leaderOf(totals);
  const winnerName =
    leader === -1 ? null : escapeHtml(state.players[leader].name);

  app.innerHTML = `
    <div class="grain" aria-hidden="true"></div>
    <main class="ledger summary">
      <header class="masthead">
        <div class="rule"><span class="diamond">◆</span></div>
        <p class="overline">The Expedition Concludes</p>
        <h1>Final Reckoning</h1>
        <p class="subtitle">${state.totalRounds} rounds · ${activeExpeditions().length} expeditions</p>
        <div class="rule"><span class="diamond">◆</span></div>
      </header>

      <div class="winner-banner ${leader === -1 ? 'is-tie' : ''}">
        ${
          leader === -1
            ? '<span class="winner-label">A Drawn Expedition</span><span class="winner-name">Both explorers tie at ' + totals[0] + '</span>'
            : '<span class="winner-label">Victor of the Lost Cities</span><span class="winner-name">' +
              winnerName +
              '</span><span class="winner-score">' +
              totals[leader] +
              ' points</span>'
        }
      </div>

      <section class="podium">
        ${state.players
          .map(
            (p, i) => `
          <article class="podium-card ${leader === i ? 'is-winner' : ''}">
            ${leader === i ? '<span class="laurel">❧</span>' : ''}
            <div class="podium-name">${escapeHtml(p.name)}</div>
            <div class="podium-total ${totals[i] < 0 ? 'is-neg' : ''}">${totals[i]}</div>
            <div class="podium-sub">grand total</div>
          </article>`
          )
          .join('')}
      </section>

      <section class="scorecard-table">
        <table>
          <thead>
            <tr>
              <th>Round</th>
              ${state.players.map((p) => `<th>${escapeHtml(p.name)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${state.history
              .map(
                (round, r) => `
              <tr>
                <td class="round-cell">Round ${r + 1}</td>
                ${round.scores
                  .map((s) => `<td class="${s < 0 ? 'neg' : s > 0 ? 'pos' : ''}">${signed(s)}</td>`)
                  .join('')}
              </tr>`
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr>
              <td class="round-cell">Total</td>
              ${totals
                .map(
                  (t, i) => `<td class="${leader === i ? 'win' : ''}">${t}</td>`
                )
                .join('')}
            </tr>
          </tfoot>
        </table>
      </section>

      <div class="summary-actions">
        <button class="minor-btn" id="prev-btn">← Previous Round</button>
        <button class="primary-btn" id="newgame-btn">Mount a New Expedition →</button>
      </div>

      <footer class="colophon">
        <span>“Not all those who wander are lost — some are merely counting points.”</span>
      </footer>
    </main>
  `;

  app.querySelector('#newgame-btn')?.addEventListener('click', newGame);
  app.querySelector('#prev-btn')?.addEventListener('click', previousRound);
}

/* --------------------------- events ------------------------------ */

function bindPlaying() {
  app.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.active = Number(btn.dataset.tab);
      save();
      render();
    })
  );

  app.querySelectorAll('[data-name]').forEach((input) => {
    input.addEventListener('input', () => {
      state.players[Number(input.dataset.name)].name = input.value;
      save();
    });
    input.addEventListener('change', render);
    input.addEventListener('click', (e) => e.stopPropagation());
  });

  // One delegated listener for every card → surgical updates, no rebuild.
  app.querySelector('.board').addEventListener('click', onCardClick);

  const toggle = app.querySelector('#sixth-toggle');
  if (toggle)
    toggle.addEventListener('change', () => {
      state.sixth = toggle.checked;
      save();
      render();
    });

  app.querySelector('#clear-btn')?.addEventListener('click', () => {
    if (confirm('Clear all played cards for this round?')) {
      state.players.forEach((p) => (p.board = blankBoard()));
      save();
      render();
    }
  });

  app.querySelector('#finish-btn')?.addEventListener('click', finishRound);
  app.querySelector('#prev-btn')?.addEventListener('click', previousRound);
}

function finishRound() {
  const scores = state.players.map((p) => scoreBoard(p.board));
  // Snapshot the boards too, so finishing can be undone with Previous Round.
  const boards = state.players.map((p) => cloneBoard(p.board));
  state.history.push({ scores, boards });

  if (state.round >= state.totalRounds) {
    state.phase = 'summary';
  } else {
    state.round += 1;
    state.players.forEach((p) => (p.board = blankBoard()));
    state.active = 0;
  }
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Undo the most recently finished round: restore its boards and return to
   the playing phase. Works from mid-game and from the summary page. */
function previousRound() {
  if (state.history.length === 0) return;
  const last = state.history.pop();
  state.players.forEach((p, i) => {
    p.board = last.boards ? cloneBoard(last.boards[i]) : blankBoard();
  });
  state.round = state.history.length + 1;
  state.phase = 'playing';
  state.active = 0;
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function newGame() {
  const names = state.players.map((p) => p.name);
  const sixth = state.sixth;
  state = defaultState();
  state.players.forEach((p, i) => (p.name = names[i]));
  state.sixth = sixth;
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onCardClick(e) {
  const btn = e.target.closest('.card');
  if (!btn) return;
  const expId = btn.dataset.exp;
  const cell = currentCell(expId);

  if (btn.dataset.hs) {
    const rank = Number(btn.dataset.hs);
    // Clicking a handshake sets the count to that rank, or clears it if it
    // was the highest already selected (so it toggles intuitively).
    cell.handshakes = cell.handshakes === rank ? rank - 1 : rank;
  } else if (btn.dataset.num) {
    const n = btn.dataset.num;
    if (cell.numbers[n]) delete cell.numbers[n];
    else cell.numbers[n] = true;
  } else {
    return;
  }

  save();
  refreshExpedition(expId);
  refreshTotals();
}

function currentCell(expId) {
  return state.players[state.active].board[expId];
}

/* Update one expedition row in place: card states + its subtotal. */
function refreshExpedition(expId) {
  const cell = currentCell(expId);
  const row = app.querySelector(`.exp[data-color="${expId}"]`);
  if (!row) return;

  row.querySelectorAll('[data-hs]').forEach((b) => {
    const on = Number(b.dataset.hs) <= cell.handshakes;
    b.classList.toggle('is-played', on);
    b.setAttribute('aria-pressed', on);
  });
  row.querySelectorAll('[data-num]').forEach((b) => {
    const on = !!cell.numbers[b.dataset.num];
    b.classList.toggle('is-played', on);
    b.setAttribute('aria-pressed', on);
  });

  const result = scoreExpedition(cell);
  const box = row.querySelector('.exp-score');
  box.classList.remove('idle', 'pos', 'neg');
  box.classList.add(!result.active ? 'idle' : result.score < 0 ? 'neg' : 'pos');
  box.querySelector('.exp-score-value').textContent = result.active
    ? signed(result.score)
    : '—';
  box.querySelector('.exp-score-detail').textContent = expeditionDetail(result);
}

/* Update both players' running totals + leader badges in place. */
function refreshTotals() {
  const totals = state.players.map((p, i) => bankedTotal_plusLive(p, i));
  const leader = leaderOf(totals);
  state.players.forEach((p, i) => {
    const card = app.querySelector(`[data-edit-player="${i}"]`);
    if (!card) return;
    const val = card.querySelector('.total-value');
    val.textContent = totals[i];
    val.classList.toggle('is-neg', totals[i] < 0);
    card.classList.toggle('is-leader', leader === i);

    const delta = card.querySelector('.round-delta');
    if (delta) delta.textContent = signed(scoreBoard(p.board));

    const head = card.querySelector('.total-card-head');
    head.querySelector('.badge')?.remove();
    if (leader === i)
      head.insertAdjacentHTML('beforeend', '<span class="badge">Leading</span>');
    else if (leader === -1)
      head.insertAdjacentHTML('beforeend', '<span class="badge tie">Tied</span>');
  });
}

/* --------------------------- utilities --------------------------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

render();
