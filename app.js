// =====================================================
// Golf Scorer — Main App Logic
// =====================================================

// --- Firebase Setup (ES Module imports) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(firebaseApp);

// --- Default hole pars (18 holes) ---
const DEFAULT_PARS = [4,4,3,4,5,3,4,4,4,4,3,5,4,3,4,5,3,4];

// --- App State ---
const state = {
  comp: null,
  currentPlayer: null,
  lbRound: 'overall',
  scoreRound: 0,
  editingCourse: null,
  isAdmin: false,
  holeModalCtx: null,
};

// Temp storage for course holes being set up (before saving to Firebase)
const pendingCourseHoles = {};

// --- Utility ---
const $ = id => document.getElementById(id);

// =====================================================
// SCREEN ROUTING
// =====================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const el = $(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('active');
  window.scrollTo(0, 0);

  if (id === 'screen-home')         initHome();
  if (id === 'screen-admin-setup')  initAdminSetup();
  if (id === 'screen-leaderboard')  renderLeaderboard();
}
window.showScreen = showScreen;

// =====================================================
// HOME SCREEN
// =====================================================
function initHome() {
  $('home-loading').classList.remove('hidden');
  $('home-no-comp').classList.add('hidden');
  $('home-comp-found').classList.add('hidden');

  // One-time load; live updates are handled by score screens
  onValue(ref(db, 'competition'), snap => {
    state.comp = snap.val();
    $('home-loading').classList.add('hidden');
    if (!state.comp || !state.comp.name) {
      $('home-no-comp').classList.remove('hidden');
    } else {
      renderHome();
    }
  }, { onlyOnce: true });
}

function renderHome() {
  const c = state.comp;
  $('home-comp-found').classList.remove('hidden');
  $('home-comp-name').textContent = c.name;

  const roundNames = c.rounds ? c.rounds.map((r,i) => r.name || `Round ${i+1}`).join(', ') : '';
  $('home-comp-info').textContent = roundNames ? `Courses: ${roundNames}` : '';

  const grid = $('home-player-list');
  grid.innerHTML = '';
  if (c.players) {
    Object.values(c.players).forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'player-btn';
      btn.innerHTML = `${escHtml(p.name)}<span class="hcp">HCP ${p.handicap}</span>`;
      btn.onclick = () => selectPlayer(p);
      grid.appendChild(btn);
    });
  }
}

function selectPlayer(player) {
  state.currentPlayer = player;
  state.scoreRound = 0;
  showScreen('screen-score');
  renderScoreScreen();
}

// =====================================================
// ADMIN
// =====================================================
function showAdminLogin() {
  if (state.isAdmin) { showScreen('screen-admin-panel'); return; }
  $('admin-pin-input').value = '';
  $('admin-pin-error').classList.add('hidden');
  showScreen('screen-admin-login');
}
window.showAdminLogin = showAdminLogin;

function checkAdminPin() {
  const pin = $('admin-pin-input').value;
  if (!state.comp || !state.comp.adminPin) {
    // No comp yet — go straight to setup
    state.isAdmin = true;
    showScreen('screen-admin-setup');
    return;
  }
  if (pin === String(state.comp.adminPin)) {
    state.isAdmin = true;
    showScreen('screen-admin-panel');
  } else {
    $('admin-pin-error').classList.remove('hidden');
  }
}
window.checkAdminPin = checkAdminPin;

function resetCompetition() {
  if (!confirm('⚠️ This will delete ALL scores and competition data. Are you sure?')) return;
  remove(ref(db, 'competition'));
  remove(ref(db, 'scores'));
  state.comp = null;
  state.isAdmin = false;
  showScreen('screen-home');
}
window.resetCompetition = resetCompetition;

// =====================================================
// ADMIN SETUP
// =====================================================
function initAdminSetup() {
  const c = state.comp;
  $('setup-comp-name').value = c ? (c.name || '') : '';
  $('setup-admin-pin').value  = c ? (c.adminPin || '') : '';

  // Players
  const playersList = $('players-list');
  playersList.innerHTML = '';
  const players = c && c.players ? Object.values(c.players) : [];
  if (players.length === 0) {
    addPlayerRow(); addPlayerRow();
  } else {
    players.forEach(p => addPlayerRow(p.name, p.handicap));
  }

  // Rounds
  const roundsDiv = $('rounds-setup');
  roundsDiv.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const round = c && c.rounds && c.rounds[i] ? c.rounds[i] : null;
    const div = document.createElement('div');
    div.className = 'round-setup-block';
    div.innerHTML = `
      <h4>Round ${i + 1}</h4>
      <label class="label">Course Name</label>
      <input type="text" class="input" id="round-name-${i}" placeholder="e.g. Costa del Sol Golf" value="${escHtml(round ? round.name || '' : ['Amarilla Golf', 'Golf del Sur', 'Abama Golf'][i] || '')}">
      <div class="course-ratings-row">
        <div class="course-rating-field">
          <label class="label">Slope Rating <span class="label-hint">(55–155)</span></label>
          <input type="number" class="input" id="round-slope-${i}" placeholder="113" min="55" max="155" step="1" inputmode="numeric" value="${round && round.slope_rating ? round.slope_rating : ''}">
        </div>
        <div class="course-rating-field">
          <label class="label">Course Rating <span class="label-hint">(e.g. 71.5)</span></label>
          <input type="number" class="input" id="round-course-rating-${i}" placeholder="71.5" min="60" max="80" step="0.1" value="${round && round.course_rating ? round.course_rating : ''}">
        </div>
        <div class="course-rating-field">
          <label class="label">Course Par <span class="label-hint">(total 18 holes)</span></label>
          <input type="number" class="input" id="round-course-par-${i}" placeholder="72" min="68" max="76" step="1" inputmode="numeric" value="${round && round.course_par ? round.course_par : ''}">
        </div>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="editCourse(${i})">⛳ Set Hole Pars &amp; SIs</button>
      <span id="course-status-${i}" style="font-size:0.85rem;color:var(--green);margin-left:8px">${round && round.holes ? '✅ Holes set' : ''}</span>
    `;
    roundsDiv.appendChild(div);
  }
  $('setup-error').classList.add('hidden');
}

function addPlayerRow(name = '', hcp = '') {
  const div = $('players-list');
  if (div.querySelectorAll('.player-row').length >= 8) return;
  const idx = div.querySelectorAll('.player-row').length + 1;
  const row = document.createElement('div');
  row.className = 'player-row';
  row.innerHTML = `
    <input type="text" class="input player-name-input" placeholder="Player ${idx}" value="${escHtml(name)}">
    <input type="number" class="input-sm player-hcp-input" placeholder="HCP" min="0" max="54" value="${hcp}" inputmode="numeric">
    <button class="btn-remove" onclick="this.parentElement.remove()">✕</button>
  `;
  div.appendChild(row);
}
window.addPlayerRow = addPlayerRow;

function editCourse(roundIndex) {
  state.editingCourse = roundIndex;
  $('course-setup-title').textContent = `Round ${roundIndex + 1} — Hole Setup`;

  const existing = pendingCourseHoles[roundIndex]
    || (state.comp && state.comp.rounds && state.comp.rounds[roundIndex] && state.comp.rounds[roundIndex].holes)
    || null;

  const list = $('course-holes-list');
  list.innerHTML = '';
  for (let h = 0; h < 18; h++) {
    const par = existing ? existing[h].par : DEFAULT_PARS[h];
    const si  = existing ? existing[h].si  : (h + 1);
    const row = document.createElement('div');
    row.className = 'hole-setup-row';
    row.innerHTML = `
      <span class="hole-label">${h + 1}</span>
      <input type="number" id="hole-par-${h}" value="${par}" min="3" max="6" inputmode="numeric">
      <input type="number" id="hole-si-${h}"  value="${si}"  min="1" max="18" inputmode="numeric">
    `;
    list.appendChild(row);
  }
  showScreen('screen-course-setup');
}
window.editCourse = editCourse;

function saveCourseSetup() {
  const holes = [];
  for (let h = 0; h < 18; h++) {
    const par = parseInt($(`hole-par-${h}`).value) || DEFAULT_PARS[h];
    const si  = parseInt($(`hole-si-${h}`).value)  || (h + 1);
    holes.push({ par, si });
  }
  pendingCourseHoles[state.editingCourse] = holes;
  showScreen('screen-admin-setup');
  // Update the status label (initAdminSetup re-renders, so just flag in pendingCourseHoles)
  const statusEl = $(`course-status-${state.editingCourse}`);
  if (statusEl) statusEl.textContent = '✅ Holes set';
}
window.saveCourseSetup = saveCourseSetup;

function saveSetup() {
  const name = $('setup-comp-name').value.trim();
  const pin  = $('setup-admin-pin').value.trim();
  if (!name) { showSetupError('Please enter a competition name.'); return; }
  if (!pin)  { showSetupError('Please enter an admin PIN.'); return; }

  // Collect players
  const nameInputs = document.querySelectorAll('.player-name-input');
  const hcpInputs  = document.querySelectorAll('.player-hcp-input');
  const players = {};
  nameInputs.forEach((inp, i) => {
    const n = inp.value.trim();
    if (n) {
      const hcp = parseInt(hcpInputs[i].value) || 0;
      const id  = `player_${i}`;
      players[id] = { id, name: n, handicap: hcp };
    }
  });
  if (Object.keys(players).length === 0) { showSetupError('Please add at least one player.'); return; }

  // Collect rounds
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    const roundName   = ($(`round-name-${i}`).value || '').trim() || `Round ${i + 1}`;
    const slopeRating  = parseFloat($(`round-slope-${i}`).value) || 0;
    const courseRating = parseFloat($(`round-course-rating-${i}`).value) || 0;
    const coursePar    = parseInt($(`round-course-par-${i}`).value) || 0;
    const holes = pendingCourseHoles[i]
      || (state.comp && state.comp.rounds && state.comp.rounds[i] && state.comp.rounds[i].holes)
      || DEFAULT_PARS.map((par, idx) => ({ par, si: idx + 1 }));
    rounds.push({ name: roundName, slope_rating: slopeRating, course_rating: courseRating, course_par: coursePar, holes });
  }

  const comp = { name, adminPin: pin, players, rounds };
  set(ref(db, 'competition'), comp)
    .then(() => {
      state.comp = comp;
      showScreen('screen-home');
    })
    .catch(err => showSetupError('Save failed: ' + err.message));
}
window.saveSetup = saveSetup;

function showSetupError(msg) {
  const el = $('setup-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// =====================================================
// SCORE ENTRY
// =====================================================
function renderScoreScreen() {
  const player = state.currentPlayer;
  const comp   = state.comp;
  if (!player || !comp) return;

  $('score-player-name').textContent = `🏌️ ${player.name}`;

  // Round tabs
  const tabsEl = $('score-round-tabs');
  tabsEl.innerHTML = '';
  comp.rounds.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === state.scoreRound ? ' active' : '');
    btn.textContent = r.name || `Round ${i + 1}`;
    btn.onclick = () => { state.scoreRound = i; renderScoreScreen(); };
    tabsEl.appendChild(btn);
  });

  // Show course handicap info for current round
  const currentRound = comp.rounds[state.scoreRound];
  const effectiveHcp = getEffectiveHandicap(player, currentRound);
  const hcpInfoEl    = $('score-hcp-info');
  if (currentRound.slope_rating && currentRound.slope_rating !== 0) {
    hcpInfoEl.textContent = `HCP Index: ${player.handicap} → Playing Handicap: ${effectiveHcp} (Slope ${currentRound.slope_rating}, CR ${currentRound.course_rating}, Par ${currentRound.course_par})`;
    hcpInfoEl.classList.remove('hidden');
  } else {
    hcpInfoEl.classList.add('hidden');
  }

  // Load scores (live)
  onValue(ref(db, 'scores'), snap => {
    const allScores = snap.val() || {};
    const myScores  = (allScores[state.scoreRound] || {})[player.id] || {};
    const round     = comp.rounds[state.scoreRound];
    const skins     = calcSkins(round, allScores[state.scoreRound] || {}, comp.players);

    renderHoles(myScores, skins);
    updateScoreSummary(player, comp, allScores, skins);
  }, { onlyOnce: true });
}

function updateScoreSummary(player, comp, allScores) {
  let totalPts = 0, holesPlayed = 0, skinsWon = 0;
  comp.rounds.forEach((round, ri) => {
    const rScores   = allScores[ri] || {};
    const myScores  = rScores[player.id] || {};
    Object.values(myScores).forEach(hs => {
      if (hs.gross > 0) { totalPts += hs.points || 0; holesPlayed++; }
    });
    calcSkins(round, rScores, comp.players).forEach(s => {
      if (s.winner === player.id) skinsWon++;
    });
  });
  $('score-total-pts').textContent  = totalPts;
  $('score-holes-played').textContent = holesPlayed;
  $('score-skins-won').textContent  = skinsWon;
}

function renderHoles(myScores, skins) {
  const player    = state.currentPlayer;
  const round     = state.comp.rounds[state.scoreRound];
  const container = $('holes-list');
  container.innerHTML = '';

  round.holes.forEach((hole, h) => {
    const hs      = myScores[h] || {};
    const scored  = hs.gross > 0;
    const skin    = skins[h];
    const skinWon = skin && skin.winner === player.id;

    const card = document.createElement('div');
    card.className = 'hole-card' + (scored ? ' scored' : '') + (skinWon ? ' skin-won' : '');
    card.onclick = () => openHoleModal(h, hole, scored ? hs.gross : hole.par, player);

    const pts = scored ? (hs.points || 0) : null;
    const ptsClass = pts !== null ? `pts-${Math.min(pts, 5)}` : '';
    const skinBadge = skinWon ? `<span class="skin-badge">🏅 Skin${skin.pot > 1 ? ' ×' + skin.pot : ''}</span>` : '';
    const rollBadge = skin && skin.rollover && !skin.winner ? `<span class="skin-badge" style="background:#ffe0b2;color:#bf360c">↩️ Roll</span>` : '';

    card.innerHTML = `
      <div class="hole-num">${h + 1}</div>
      <div class="hole-info">
        <div class="hole-par-si">Par ${hole.par} · SI ${hole.si}</div>
        <div class="hole-gross">${scored ? `Gross: ${hs.gross}` : '<span style="color:var(--text-muted)">Tap to enter score</span>'}${skinBadge}${rollBadge}</div>
      </div>
      <div class="hole-points ${ptsClass}">${pts !== null ? pts + 'pts' : '—'}</div>
    `;
    container.appendChild(card);
  });
}

// =====================================================
// HOLE MODAL
// =====================================================
let modalScore = 4;

function openHoleModal(holeIdx, holeData, currentGross, player) {
  state.holeModalCtx = { holeIdx, holeData, player };
  modalScore = currentGross || holeData.par;
  $('modal-title').textContent = `Hole ${holeIdx + 1}`;
  const round        = state.comp.rounds[state.scoreRound];
  const effectiveHcp = getEffectiveHandicap(player, round);
  const shots        = calcShots(effectiveHcp, holeData.si);
  const hcpLabel     = (effectiveHcp !== player.handicap)
    ? `Playing HCP ${effectiveHcp}`
    : `HCP ${player.handicap}`;
  $('modal-info').textContent = `Par ${holeData.par} · SI ${holeData.si} · ${hcpLabel} · You get ${shots} shot${shots !== 1 ? 's' : ''}`;
  updateModalDisplay();
  $('hole-modal').classList.remove('hidden');
}

function updateModalDisplay() {
  $('modal-score').textContent = modalScore;
  const ctx = state.holeModalCtx;
  if (!ctx) return;
  const { holeData, player } = ctx;
  const round        = state.comp.rounds[state.scoreRound];
  const effectiveHcp = getEffectiveHandicap(player, round);
  const pts = calcStableford(modalScore, holeData.par, holeData.si, effectiveHcp);
  const labels = ['Double bogey or worse 💀', 'Bogey 🟡', 'Par 🟢', 'Birdie 🔵', 'Eagle ⭐', 'Albatross 🦅'];
  const colors  = ['#bbb', '#888', 'var(--green)', 'var(--blue)', 'var(--gold)', 'var(--red)'];
  $('modal-points').textContent  = `${pts} point${pts !== 1 ? 's' : ''} — ${labels[Math.min(pts, 5)]}`;
  $('modal-points').style.color  = colors[Math.min(pts, 5)];
}

function adjustScore(delta) {
  modalScore = Math.max(1, Math.min(15, modalScore + delta));
  updateModalDisplay();
}
window.adjustScore = adjustScore;

function closeHoleModal() {
  $('hole-modal').classList.add('hidden');
  state.holeModalCtx = null;
}
window.closeHoleModal = closeHoleModal;

function saveHoleScore() {
  const ctx = state.holeModalCtx;
  if (!ctx) return;
  const { holeIdx, holeData, player } = ctx;
  const gross        = modalScore;
  const round        = state.comp.rounds[state.scoreRound];
  const effectiveHcp = getEffectiveHandicap(player, round);
  const points       = calcStableford(gross, holeData.par, holeData.si, effectiveHcp);

  set(ref(db, `scores/${state.scoreRound}/${player.id}/${holeIdx}`), { gross, points })
    .then(() => { closeHoleModal(); renderScoreScreen(); });
}
window.saveHoleScore = saveHoleScore;

// =====================================================
// COURSE HANDICAP CALCULATION
// =====================================================
function calcCourseHandicap(handicapIndex, slopeRating, courseRating, coursePar) {
  // Course Handicap = ROUND(HI × (Slope ÷ 113) + (CourseRating − CoursePar))
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - coursePar));
}

function getEffectiveHandicap(player, round) {
  // Falls back to raw handicap index if slope_rating not set
  if (!round || !round.slope_rating || round.slope_rating === 0) return player.handicap;
  return calcCourseHandicap(player.handicap, round.slope_rating, round.course_rating || 0, round.course_par || 72);
}

// =====================================================
// STABLEFORD CALCULATION
// =====================================================
function calcShots(handicap, si) {
  if (handicap >= si + 18) return 2;
  if (si <= handicap)      return 1;
  return 0;
}

function calcStableford(gross, par, si, handicap) {
  const shots = calcShots(handicap, si);
  const net   = gross - shots;
  const diff  = net - par;   // negative = under par
  if (diff <= -3) return 5;  // albatross
  if (diff === -2) return 4; // eagle
  if (diff === -1) return 3; // birdie
  if (diff === 0)  return 2; // par
  if (diff === 1)  return 1; // bogey
  return 0;                  // double bogey or worse
}

// =====================================================
// SKINS CALCULATION
// =====================================================
function calcSkins(round, allRoundScores, players) {
  // Returns array[18] of { winner: playerId|null, rollover: bool, pot: number }
  const result   = [];
  let rollingPot = 0;

  for (let h = 0; h < 18; h++) {
    rollingPot++;
    let bestPts     = -1;
    let bestPlayers = [];

    Object.entries(allRoundScores).forEach(([pid, pScores]) => {
      const hs = pScores ? pScores[h] : null;
      if (!hs || hs.gross == null) return;
      const pts = hs.points || 0;
      if (pts > bestPts)       { bestPts = pts; bestPlayers = [pid]; }
      else if (pts === bestPts) { bestPlayers.push(pid); }
    });

    if (bestPlayers.length === 1 && bestPts >= 0) {
      result.push({ winner: bestPlayers[0], rollover: false, pot: rollingPot });
      rollingPot = 0;
    } else if (bestPlayers.length > 1) {
      result.push({ winner: null, rollover: true, pot: rollingPot });
      // pot rolls over — don't reset
    } else {
      result.push({ winner: null, rollover: false, pot: rollingPot });
    }
  }
  return result;
}

// =====================================================
// LEADERBOARD
// =====================================================
function renderLeaderboard() {
  const comp = state.comp;
  if (!comp) return;

  // Build tabs
  const tabsEl = $('lb-round-tabs');
  tabsEl.innerHTML = '';
  const tabs = [
    { id: 'overall', label: '🏆 Overall' },
    ...comp.rounds.map((r, i) => ({ id: i, label: r.name || `Rd ${i + 1}` })),
  ];
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (state.lbRound === t.id ? ' active' : '');
    btn.textContent = t.label;
    btn.onclick = () => { state.lbRound = t.id; renderLeaderboard(); };
    tabsEl.appendChild(btn);
  });

  // Live scores
  onValue(ref(db, 'scores'), snap => {
    const allScores = snap.val() || {};
    const players   = comp.players ? Object.values(comp.players) : [];

    // Skins per round
    const roundSkins = comp.rounds.map((round, ri) =>
      calcSkins(round, allScores[ri] || {}, comp.players)
    );
    const skinCounts = {};
    players.forEach(p => { skinCounts[p.id] = 0; });
    roundSkins.forEach(skins => skins.forEach(s => {
      if (s.winner && skinCounts[s.winner] !== undefined) skinCounts[s.winner]++;
    }));

    // Player totals
    const totals = players.map(p => {
      const roundPts = comp.rounds.map((_, ri) => {
        const rScores = (allScores[ri] || {})[p.id] || {};
        let pts = 0, holes = 0;
        Object.values(rScores).forEach(hs => {
          if (hs.gross > 0) { pts += hs.points || 0; holes++; }
        });
        return { pts, holes };
      });
      const totalPts   = roundPts.reduce((s, r) => s + r.pts, 0);
      const holesPlayed = roundPts.reduce((s, r) => s + r.holes, 0);
      return { ...p, roundPts, totalPts, holesPlayed, skins: skinCounts[p.id] || 0 };
    });

    // Display subset
    const display = totals.map(t => ({
      ...t,
      displayPts:   state.lbRound === 'overall' ? t.totalPts   : t.roundPts[state.lbRound].pts,
      displayHoles: state.lbRound === 'overall' ? t.holesPlayed : t.roundPts[state.lbRound].holes,
    })).sort((a, b) => b.displayPts - a.displayPts || b.displayHoles - a.displayHoles);

    renderLbTable(display);
    renderSkinsSummary(comp, roundSkins, allScores);
  }, { onlyOnce: true });
}

function renderLbTable(display) {
  const tableEl = $('lb-table');
  tableEl.innerHTML = '';
  const medals  = ['🥇', '🥈', '🥉'];
  const classes  = ['gold', 'silver', 'bronze'];

  display.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';

    // Build HCP display — show playing handicap per round when available
    let hcpDisplay;
    if (state.lbRound === 'overall') {
      hcpDisplay = `HCP ${t.handicap}`;
    } else {
      const round        = state.comp.rounds[state.lbRound];
      const playingHcp   = getEffectiveHandicap(t, round);
      hcpDisplay = (playingHcp !== t.handicap)
        ? `HCP ${t.handicap} · Playing ${playingHcp}`
        : `HCP ${t.handicap}`;
    }

    const roundBreakdown = state.lbRound === 'overall'
      ? ' · ' + t.roundPts.map((r, ri) => `R${ri+1}:${r.pts}`).join(' ')
      : '';
    row.innerHTML = `
      <div class="lb-rank ${classes[i] || ''}">${medals[i] || (i + 1)}</div>
      <div style="flex:1">
        <div class="lb-name">${escHtml(t.name)}</div>
        <div class="lb-sub">${hcpDisplay} · ${t.displayHoles} holes${roundBreakdown}</div>
      </div>
      <div class="lb-pts">${t.displayPts}</div>
      ${t.skins > 0 ? `<div class="lb-skins">🏅 ${t.skins}</div>` : ''}
    `;
    tableEl.appendChild(row);
  });

  if (display.length === 0) {
    tableEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px">No scores yet — get playing! 🏌️</p>';
  }
}

function renderSkinsSummary(comp, roundSkins, allScores) {
  const el = $('skins-table');
  el.innerHTML = '';

  const roundIndices = state.lbRound === 'overall'
    ? comp.rounds.map((_, i) => i)
    : [state.lbRound];

  roundIndices.forEach(ri => {
    const round = comp.rounds[ri];
    const skins = roundSkins[ri];

    const h4 = document.createElement('h4');
    h4.style.cssText = 'margin:14px 0 8px;color:var(--green-dark)';
    h4.textContent   = round.name || `Round ${ri + 1}`;
    el.appendChild(h4);

    const grid = document.createElement('div');
    grid.className   = 'skins-grid';

    skins.forEach((s, h) => {
      const cell = document.createElement('div');
      if (s.winner) {
        const winner = comp.players && Object.values(comp.players).find(p => p.id === s.winner);
        cell.className = 'skin-cell skin-won-cell';
        cell.innerHTML = `<span class="hole-n">H${h+1}</span>${winner ? escHtml(winner.name.split(' ')[0]) : '?'}${s.pot > 1 ? `<br>×${s.pot}` : ''}`;
      } else if (s.rollover) {
        cell.className = 'skin-cell skin-roll-cell';
        cell.innerHTML = `<span class="hole-n">H${h+1}</span>Roll`;
      } else {
        cell.className = 'skin-cell skin-none-cell';
        cell.innerHTML = `<span class="hole-n">H${h+1}</span>—`;
      }
      grid.appendChild(cell);
    });
    el.appendChild(grid);
  });
}

// =====================================================
// HELPERS
// =====================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =====================================================
// INIT
// =====================================================
window.addEventListener('DOMContentLoaded', () => {
  showScreen('screen-home');
});
