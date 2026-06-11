import './style.css';

/* ------------------------------------------------------------------ *
 *  Lost Cities — Expedition Ledger
 *  Scoring rules (per expedition colour that has at least one card):
 *    1. Begin at -20 (the cost of mounting the expedition).
 *    2. Add the face value of every number card played (2–10).
 *    3. Multiply the running total by (handshakes + 1).
 *    4. If 8 or more cards were played, add a +20 bonus.
 *  An expedition with no cards scores nothing.
 * ------------------------------------------------------------------ */

const NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const MAX_HANDSHAKES = 3;

const EXPEDITIONS = [
  { id: 'yellow', name: 'Yellow', glyph: 'Ⅰ' },
  { id: 'blue', name: 'Blue', glyph: 'Ⅱ' },
  { id: 'white', name: 'White', glyph: 'Ⅲ' },
  { id: 'green', name: 'Green', glyph: 'Ⅳ' },
  { id: 'red', name: 'Red', glyph: 'Ⅴ' },
  { id: 'purple', name: 'Purple', glyph: 'Ⅵ' },
];

/* ----------------------------- state ----------------------------- */

const STORAGE_KEY = 'lost-cities-ledger-v1';

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
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // light validation / migration
    if (!parsed.players || parsed.players.length !== 2) return defaultState();
    parsed.players.forEach((p) => {
      const base = blankBoard();
      p.board = { ...base, ...(p.board || {}) };
    });
    return parsed;
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

/* --------------------------- helpers ----------------------------- */

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function expeditionDetail(result) {
  if (!result.active) return 'no cards';
  const mult = result.multiplier > 1 ? `×${result.multiplier} · ` : '';
  const cards = `${result.cardCount} card${result.cardCount === 1 ? '' : 's'}`;
  const bonus = result.bonus ? ' · +20' : '';
  return `${mult}${cards}${bonus}`;
}

/* --------------------------- rendering --------------------------- */

const app = document.getElementById('app');

function render() {
  const totals = state.players.map((p) => scoreBoard(p.board));
  const leader =
    totals[0] === totals[1] ? -1 : totals[0] > totals[1] ? 0 : 1;

  app.innerHTML = `
    <div class="grain" aria-hidden="true"></div>
    <main class="ledger">
      <header class="masthead">
        <div class="rule"><span class="diamond">◆</span></div>
        <p class="overline">An Archaeological Accounting</p>
        <h1>Lost Cities</h1>
        <p class="subtitle">Expedition Ledger &amp; Scorekeeper</p>
        <div class="rule"><span class="diamond">◆</span></div>
      </header>

      <section class="scoreboard">
        ${state.players
          .map((p, i) => playerTotalCard(p, totals[i], leader, i))
          .join('')}
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
          <button class="ghost-btn" id="reset-btn">Clear Ledger</button>
        </div>
      </section>

      <section class="board">
        ${activeExpeditions()
          .map((e) => expeditionRow(e, state.players[state.active].board[e.id]))
          .join('')}
      </section>

      <footer class="colophon">
        <span>Begin every expedition at −20 · ×(handshakes + 1) · +20 at eight cards</span>
      </footer>
    </main>
  `;

  bind();
}

function playerTotalCard(player, total, leader, index) {
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
      <div class="total-sub">points</div>
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

  const subtotalClass = !result.active
    ? 'idle'
    : result.score < 0
    ? 'neg'
    : 'pos';

  const detail = expeditionDetail(result);

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
        <span class="exp-score-detail">${detail}</span>
      </div>
    </article>
  `;
}

/* --------------------------- events ------------------------------ */

function bind() {
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
    // keep caret usable without triggering parent handlers
    input.addEventListener('click', (e) => e.stopPropagation());
  });

  // One delegated listener for every card. Clicks make surgical DOM updates
  // (no innerHTML rebuild), so selecting cards stays instant even when fast.
  app.querySelector('.board').addEventListener('click', onCardClick);

  const toggle = app.querySelector('#sixth-toggle');
  if (toggle)
    toggle.addEventListener('change', () => {
      state.sixth = toggle.checked;
      save();
      render();
    });

  app.querySelector('#reset-btn')?.addEventListener('click', () => {
    if (confirm('Clear all played cards for both explorers?')) {
      const names = state.players.map((p) => p.name);
      state = defaultState();
      state.players.forEach((p, i) => (p.name = names[i]));
      save();
      render();
    }
  });
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
  const totals = state.players.map((p) => scoreBoard(p.board));
  const leader = totals[0] === totals[1] ? -1 : totals[0] > totals[1] ? 0 : 1;
  state.players.forEach((p, i) => {
    const card = app.querySelector(`[data-edit-player="${i}"]`);
    if (!card) return;
    const val = card.querySelector('.total-value');
    val.textContent = totals[i];
    val.classList.toggle('is-neg', totals[i] < 0);
    card.classList.toggle('is-leader', leader === i);
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
