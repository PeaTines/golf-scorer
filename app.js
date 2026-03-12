// =====================================================
// Golf Scorer — Main App Logic
// =====================================================

// --- Firebase Setup (ES Module imports) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, remove } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(firebaseApp);

// --- Golf Course API ---
const GOLF_API_KEY  = 'DEIJXBJWWU3ER7XYAEYSE72MCQ';
const GOLF_API_BASE = 'https://api.golfcourseapi.com/v1';

// --- Default hole pars (18 holes) ---
const DEFAULT_PARS = [4,4,3,4,5,3,4,4,4,4,3,5,4,3,4,5,3,4];

// --- App State ---
const state = {
  activeCompId: localStorage.getItem('activeCompId') || null,
  comp: null,
  currentPlayer: null,
  lbRound: 'overall',
  scoreRound: 0,
  editingCourse: null,
  isAdmin: false,
  holeModalCtx: null,
  allComps: {},
  isCopying: false
};

// Temp storage for course holes being set up (before saving to Firebase)
// Keyed by block ID (unique per block in the dynamic rounds setup)
const pendingCourseHoles = {};

// Tracks which original round index a dynamic block corresponds to (edit mode)
const blockOriginalRound = {};

// Counter for assigning unique IDs to round blocks
let courseBlockCounter = 0;

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
  if (id === 'screen-comp-menu')    initCompMenu();
  if (id === 'screen-admin-setup' && !state.returningFromHoles)  initAdminSetup();
  if (id === 'screen-leaderboard')  renderLeaderboard();
}
window.showScreen = showScreen;

// =====================================================
// LOBBY / HOME SCREEN
// =====================================================
function initHome() {
  $('lobby-loading').classList.remove('hidden');
  const list = $('lobby-list');
  list.innerHTML = '';

  get(ref(db, 'competitions'))
    .then(snap => {
      state.allComps = snap.val() || {};
      renderLobby();
    })
    .catch(err => {
      list.innerHTML = '<p class="info-text">Error loading competitions. Check your connection and refresh.</p>';
    })
    .finally(() => {
      $('lobby-loading').classList.add('hidden');
    });
}

function renderLobby() {
  const list = $('lobby-list');
  list.innerHTML = '';

  const comps = Object.entries(state.allComps).map(([id, data]) => ({
    id,
    ...data.meta
  })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (comps.length === 0) {
    list.innerHTML = '<p class="info-text">No competitions yet. Create one to get started!</p>';
    return;
  }

  comps.forEach(c => {
    const card = document.createElement('div');
    card.className = 'comp-card';
    const playerCount = c.players ? Object.keys(c.players).length : 0;
    const roundCount = c.rounds ? c.rounds.length : 0;
    const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '';

    card.innerHTML = `
      <div class="comp-card-main">
        <div class="comp-card-name">${escHtml(c.name)}</div>
        <div class="comp-card-meta">${dateStr ? dateStr + ' · ' : ''}${playerCount} players · ${roundCount} rounds</div>
      </div>
      <div class="comp-card-actions">
        <button class="btn btn-primary btn-sm" onclick="openCompetition('${c.id}')">Open</button>
        <button class="btn btn-outline btn-sm" onclick="copyCompetition('${c.id}')">Copy</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function createNewCompetition() {
  state.activeCompId = null;
  state.comp = null;
  state.isAdmin = true;
  state.isCopying = false;
  showScreen('screen-admin-setup');
}
window.createNewCompetition = createNewCompetition;

function openCompetition(compId) {
  state.activeCompId = compId;
  localStorage.setItem('activeCompId', compId);
  state.isAdmin = false;
  showScreen('screen-comp-menu');
}
window.openCompetition = openCompetition;

function copyCompetition(compId) {
  const sourceComp = state.allComps[compId];
  if (!sourceComp) return;

  state.activeCompId = null;
  state.isCopying = true;
  state.isAdmin = true;

  const meta = sourceComp.meta;
  state.comp = {
    ...meta,
    name: incrementName(meta.name),
    adminPin: ''
  };

  showScreen('screen-admin-setup');
}
window.copyCompetition = copyCompetition;

function incrementName(name) {
  const yearMatch = name.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    return name.replace(yearMatch[1], year + 1);
  }
  return name + ' (Copy)';
}

// =====================================================
// COMPETITION MENU
// =====================================================
function initCompMenu() {
  if (!state.activeCompId) { showScreen('screen-home'); return; }

  const path = `competitions/${state.activeCompId}/meta`;

  onValue(ref(db, path), snap => {
    state.comp = snap.val();
    if (!state.comp) {
      alert('Competition not found.');
      showScreen('screen-home');
      return;
    }
    renderCompMenu();
  }, { onlyOnce: true });
}

function renderCompMenu() {
  const c = state.comp;
  $('menu-comp-name').textContent = c.name;

  const roundNames = c.rounds ? c.rounds.map((r,i) => r.name || `Round ${i+1}`).join(', ') : '';
  $('menu-comp-info').textContent = roundNames ? `Courses: ${roundNames}` : '';

  const grid = $('menu-player-list');
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
  if (!confirm('⚠️ This will delete ALL scores and competition data for this competition. Are you sure?')) return;
  remove(ref(db, `competitions/${state.activeCompId}`));
  state.comp = null;
  state.activeCompId = null;
  localStorage.removeItem('activeCompId');
  state.isAdmin = false;
  showScreen('screen-home');
}
window.resetCompetition = resetCompetition;

// =====================================================
// ADMIN SETUP — Dynamic Round Blocks
// =====================================================

function buildRoundBlockHTML(blockId, round) {
  return `
    <div class="round-block-header">
      <h4 class="round-block-title"></h4>
      <button type="button" class="btn btn-danger btn-sm remove-course-btn" onclick="removeRoundBlock(${blockId})">🗑 Remove</button>
    </div>
    <label class="label">Find Course <span class="label-hint">(optional)</span></label>
    <div class="course-search-row">
      <input type="text" class="input course-search-input" id="course-search-${blockId}" placeholder="e.g. Costa del Sol Golf" onkeydown="if(event.key==='Enter')searchCourse(${blockId})">
      <button class="btn btn-outline btn-sm course-search-btn" onclick="searchCourse(${blockId})">🔍 Search</button>
    </div>
    <div id="course-results-${blockId}" class="course-results hidden"></div>
    <div id="tee-selector-${blockId}" class="tee-selector hidden"></div>
    <p class="course-search-hint">Course not found? Enter details manually.</p>
    <label class="label">Course Name</label>
    <input type="text" class="input" id="round-name-${blockId}" placeholder="Course name" value="${escHtml(round ? round.name || '' : '')}">
    <div class="course-ratings-row">
      <div class="course-rating-field">
        <label class="label">Slope Rating <span class="label-hint">(55–155)</span></label>
        <input type="number" class="input" id="round-slope-${blockId}" placeholder="113" min="55" max="155" step="1" inputmode="numeric" value="${round && round.slope_rating ? round.slope_rating : ''}">
      </div>
      <div class="course-rating-field">
        <label class="label">Course Rating <span class="label-hint">(e.g. 71.5)</span></label>
        <input type="number" class="input" id="round-course-rating-${blockId}" placeholder="71.5" min="60" max="80" step="0.1" value="${round && round.course_rating ? round.course_rating : ''}">
      </div>
      <div class="course-rating-field">
        <label class="label">Course Par <span class="label-hint">(total 18 holes)</span></label>
        <input type="number" class="input" id="round-course-par-${blockId}" placeholder="72" min="68" max="76" step="1" inputmode="numeric" value="${round && round.course_par ? round.course_par : ''}">
      </div>
    </div>
    <button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="editCourse(${blockId})">⛳ Set Hole Pars &amp; SIs</button>
    <span id="course-status-${blockId}" style="font-size:0.85rem;color:var(--green);margin-left:8px">${round && round.holes ? '✅ Holes set' : ''}</span>
  `;
}

function createRoundBlock(round, originalIndex) {
  const blockId = courseBlockCounter++;
  if (originalIndex !== undefined) {
    blockOriginalRound[blockId] = originalIndex;
  }
  const div = document.createElement('div');
  div.className = 'round-setup-block';
  div.dataset.blockId = blockId;
  div.innerHTML = buildRoundBlockHTML(blockId, round);
  return div;
}

function updateRoundBlockHeaders() {
  const blocks = document.querySelectorAll('#rounds-setup .round-setup-block');
  blocks.forEach((block, i) => {
    const titleEl = block.querySelector('.round-block-title');
    if (titleEl) titleEl.textContent = `Course ${i + 1}`;
  });
}

function updateRemoveButtons() {
  const blocks = document.querySelectorAll('#rounds-setup .round-setup-block');
  blocks.forEach(block => {
    const removeBtn = block.querySelector('.remove-course-btn');
    if (removeBtn) {
      removeBtn.style.display = blocks.length > 1 ? '' : 'none';
    }
  });
}

function addRoundBlock() {
  const blocks = document.querySelectorAll('#rounds-setup .round-setup-block');
  if (blocks.length >= 4) {
    alert('Maximum 4 courses allowed.');
    return;
  }
  const div = createRoundBlock(null, undefined);
  $('rounds-setup').appendChild(div);
  updateRoundBlockHeaders();
  updateRemoveButtons();
}
window.addRoundBlock = addRoundBlock;

function removeRoundBlock(blockId) {
  const block = document.querySelector(`#rounds-setup .round-setup-block[data-block-id="${blockId}"]`);
  if (block) block.remove();
  updateRoundBlockHeaders();
  updateRemoveButtons();
}
window.removeRoundBlock = removeRoundBlock;

function initAdminSetup() {
  const c = state.comp;
  const isEdit = !!state.activeCompId && !state.isCopying;

  $('setup-title').textContent = isEdit ? '✏️ Edit Competition' : (state.isCopying ? '👯 Copy Competition' : '⚙️ New Competition');
  $('setup-back-btn').onclick = () => showScreen(isEdit ? 'screen-admin-panel' : 'screen-home');

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

  // Reset block state for fresh init
  courseBlockCounter = 0;
  Object.keys(blockOriginalRound).forEach(k => delete blockOriginalRound[k]);
  Object.keys(pendingCourseHoles).forEach(k => delete pendingCourseHoles[k]);

  // Rounds — dynamic blocks
  const roundsDiv = $('rounds-setup');
  roundsDiv.innerHTML = '';

  const existingRounds = c && c.rounds ? c.rounds : [];
  const numBlocks = existingRounds.length > 0 ? existingRounds.length : 1;

  for (let i = 0; i < numBlocks; i++) {
    const round = existingRounds[i] || null;
    const div = createRoundBlock(round, i);
    roundsDiv.appendChild(div);
  }

  updateRoundBlockHeaders();
  updateRemoveButtons();

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

function editCourse(blockId) {
  state.editingCourse = blockId;
  // Determine display title from DOM position
  const blocks = Array.from(document.querySelectorAll('#rounds-setup .round-setup-block'));
  const pos = blocks.findIndex(b => b.dataset.blockId == blockId);
  $('course-setup-title').textContent = `Course ${pos + 1} — Hole Setup`;

  // Existing holes: from pending, or from original round data
  let existing = pendingCourseHoles[blockId] || null;
  if (!existing && blockOriginalRound[blockId] !== undefined) {
    const origIdx = blockOriginalRound[blockId];
    existing = state.comp && state.comp.rounds && state.comp.rounds[origIdx]
      ? state.comp.rounds[origIdx].holes
      : null;
  }

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
  // Return to admin setup WITHOUT re-initialising the form
  state.returningFromHoles = true;
  showScreen('screen-admin-setup');
  state.returningFromHoles = false;
  // Update the status label
  const statusEl = $(`course-status-${state.editingCourse}`);
  if (statusEl) statusEl.textContent = '✅ Holes set';
}
window.saveCourseSetup = saveCourseSetup;

// =====================================================
// COURSE PROPERTY COMPARISON (for recalculation prompt)
// =====================================================
function coursePropertiesChanged(oldRound, newRound) {
  if (!oldRound || !newRound) return false;
  if (oldRound.slope_rating !== newRound.slope_rating) return true;
  if (oldRound.course_rating !== newRound.course_rating) return true;
  if (oldRound.course_par !== newRound.course_par) return true;
  if (!oldRound.holes || !newRound.holes) return false;
  for (let h = 0; h < 18; h++) {
    const oh = oldRound.holes[h];
    const nh = newRound.holes[h];
    if (!oh || !nh) continue;
    if (oh.par !== nh.par) return true;
    if (oh.si  !== nh.si)  return true;
  }
  return false;
}

async function recalculateRoundScores(compId, roundIndex, round, roundScores, players) {
  for (const [playerId, playerScores] of Object.entries(roundScores)) {
    const player = players[playerId];
    if (!player) continue;

    const effectiveHcp = getEffectiveHandicap(player, round);

    for (const [holeIdxStr, hs] of Object.entries(playerScores)) {
      const holeIdx = parseInt(holeIdxStr);
      if (!hs || !hs.gross || hs.gross <= 0) continue;
      const hole = round.holes[holeIdx];
      if (!hole) continue;

      const points = calcStableford(hs.gross, hole.par, hole.si, effectiveHcp);
      await set(
        ref(db, `competitions/${compId}/scores/${roundIndex}/${playerId}/${holeIdx}`),
        { gross: hs.gross, points }
      );
    }
  }
}

// =====================================================
// SAVE SETUP
// =====================================================
async function saveSetup() {
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

  // Collect rounds from dynamic DOM blocks (in DOM order)
  const roundBlocks = document.querySelectorAll('#rounds-setup .round-setup-block');
  if (roundBlocks.length === 0) { showSetupError('Please add at least one course.'); return; }

  const rounds = [];
  roundBlocks.forEach((block, pos) => {
    const bid = block.dataset.blockId;
    const roundName   = ($(`round-name-${bid}`)?.value || '').trim() || `Round ${pos + 1}`;
    const slopeRating  = parseFloat($(`round-slope-${bid}`)?.value) || 0;
    const courseRating = parseFloat($(`round-course-rating-${bid}`)?.value) || 0;
    const coursePar    = parseInt($(`round-course-par-${bid}`)?.value) || 0;

    let holes;
    if (pendingCourseHoles[bid]) {
      holes = pendingCourseHoles[bid];
    } else if (blockOriginalRound[bid] !== undefined && state.comp && state.comp.rounds && state.comp.rounds[blockOriginalRound[bid]]) {
      holes = state.comp.rounds[blockOriginalRound[bid]].holes;
    } else {
      holes = DEFAULT_PARS.map((par, idx) => ({ par, si: idx + 1 }));
    }

    rounds.push({ name: roundName, slope_rating: slopeRating, course_rating: courseRating, course_par: coursePar, holes });
  });

  const isNew = !state.activeCompId || state.isCopying;

  const compMeta = { name, adminPin: pin, players, rounds, updatedAt: Date.now() };
  if (isNew) {
    compMeta.createdAt = Date.now();
  } else if (state.comp && state.comp.createdAt) {
    compMeta.createdAt = state.comp.createdAt;
  }

  let compId = state.activeCompId;
  if (isNew) {
    compId = 'comp_' + Date.now();
  }

  try {
    await set(ref(db, `competitions/${compId}/meta`), compMeta);

    // If editing (not new/copy), check if course properties changed and prompt recalculation
    if (!isNew && state.comp && state.comp.rounds) {
      const oldRounds = state.comp.rounds;
      // Check each round position that exists in both old and new
      const checkCount = Math.min(oldRounds.length, rounds.length);

      for (let ri = 0; ri < checkCount; ri++) {
        // Find the blockId that maps to original round ri (if it still exists in DOM)
        // We stored blockOriginalRound[blockId] = originalIndex when creating blocks
        // Find the DOM block at position ri
        const blockAtPos = roundBlocks[ri];
        const bid = blockAtPos ? blockAtPos.dataset.blockId : null;
        const originalIdx = bid !== null ? blockOriginalRound[bid] : undefined;

        // Only compare if this block corresponds to the same original round position
        if (originalIdx !== ri) continue;

        const oldRound = oldRounds[ri];
        const newRound = rounds[ri];

        if (coursePropertiesChanged(oldRound, newRound)) {
          // Check if scores exist for this round
          const scoresSnap = await get(ref(db, `competitions/${compId}/scores/${ri}`));
          const roundScores = scoresSnap.val();

          if (roundScores && Object.keys(roundScores).length > 0) {
            const courseName = newRound.name || `Round ${ri + 1}`;
            const shouldRecalc = confirm(
              `Course properties have changed for "${courseName}".\n\nRecalculate all stableford scores with the new course data?\n\nOK = Yes   Cancel = No`
            );

            if (shouldRecalc) {
              await recalculateRoundScores(compId, ri, newRound, roundScores, players);
            }
          }
        }
      }
    }

    state.comp = compMeta;
    state.activeCompId = compId;
    state.isCopying = false;
    localStorage.setItem('activeCompId', compId);
    showScreen('screen-comp-menu');
  } catch (err) {
    showSetupError('Save failed: ' + err.message);
  }
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
function getScorePath() {
  return `competitions/${state.activeCompId}/scores`;
}

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
  onValue(ref(db, getScorePath()), snap => {
    const allScores = snap.val() || {};
    const myScores  = (allScores[state.scoreRound] || {})[player.id] || {};
    const round     = comp.rounds[state.scoreRound];
    const skins     = calcSkins(round, allScores[state.scoreRound] || {}, comp.players);

    renderHoles(myScores, skins);
    updateScoreSummary(player, comp, allScores, skins);
  }, { onlyOnce: true });
}

function updateScoreSummary(player, comp, allScores) {
  // Show stats for the currently selected round only (not overall total)
  const ri    = state.scoreRound;
  const round = comp.rounds[ri];
  const rScores = (allScores[ri] || {})[player.id] || {};

  let totalPts = 0, holesPlayed = 0, skinsWon = 0;
  Object.values(rScores).forEach(hs => {
    if (hs.gross > 0) { totalPts += hs.points || 0; holesPlayed++; }
  });

  const skins = calcSkins(round, allScores[ri] || {}, comp.players);
  skins.forEach(s => {
    if (s.winner === player.id) skinsWon++;
  });

  $('score-total-pts').textContent    = totalPts;
  $('score-holes-played').textContent = holesPlayed;
  $('score-skins-won').textContent    = skinsWon;

  // Update round label
  const roundLabelEl = $('score-round-label');
  if (roundLabelEl) {
    const roundName = round.name || `Round ${ri + 1}`;
    roundLabelEl.textContent = roundName;
  }
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

  // Update "Save & Next" button text
  const isLastHole = holeIdx >= round.holes.length - 1;
  const saveNextBtn = $('save-next-btn');
  if (saveNextBtn) {
    saveNextBtn.textContent = isLastHole ? 'Save & Finish ✅' : 'Save & Next →';
  }

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

  set(ref(db, `${getScorePath()}/${state.scoreRound}/${player.id}/${holeIdx}`), { gross, points })
    .then(() => { closeHoleModal(); renderScoreScreen(); });
}
window.saveHoleScore = saveHoleScore;

function saveAndNextHole() {
  const ctx = state.holeModalCtx;
  if (!ctx) return;
  const { holeIdx, holeData, player } = ctx;
  const gross        = modalScore;
  const round        = state.comp.rounds[state.scoreRound];
  const effectiveHcp = getEffectiveHandicap(player, round);
  const points       = calcStableford(gross, holeData.par, holeData.si, effectiveHcp);

  set(ref(db, `${getScorePath()}/${state.scoreRound}/${player.id}/${holeIdx}`), { gross, points })
    .then(() => {
      const nextHoleIdx = holeIdx + 1;
      if (nextHoleIdx >= round.holes.length) {
        // Last hole — just close
        closeHoleModal();
        renderScoreScreen();
      } else {
        // Close current modal, then open next hole
        state.holeModalCtx = null;
        $('hole-modal').classList.add('hidden');

        // Fetch fresh scores so we can pre-fill existing score for next hole
        get(ref(db, `${getScorePath()}/${state.scoreRound}/${player.id}`)).then(snap => {
          const myScores  = snap.val() || {};
          const nextHs    = myScores[nextHoleIdx] || {};
          const nextHole  = round.holes[nextHoleIdx];
          renderScoreScreen();
          openHoleModal(nextHoleIdx, nextHole, nextHs.gross || nextHole.par, player);
        });
      }
    });
}
window.saveAndNextHole = saveAndNextHole;

// =====================================================
// COURSE HANDICAP CALCULATION
// =====================================================
function calcCourseHandicap(handicapIndex, slopeRating, courseRating, coursePar) {
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - coursePar));
}

function getEffectiveHandicap(player, round) {
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
  const diff  = net - par;
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

  onValue(ref(db, getScorePath()), snap => {
    const allScores = snap.val() || {};
    const players   = comp.players ? Object.values(comp.players) : [];

    const roundSkins = comp.rounds.map((round, ri) =>
      calcSkins(round, allScores[ri] || {}, comp.players)
    );
    const skinCounts = {};
    players.forEach(p => { skinCounts[p.id] = 0; });
    roundSkins.forEach(skins => skins.forEach(s => {
      if (s.winner && skinCounts[s.winner] !== undefined) skinCounts[s.winner]++;
    }));

    const totals = players.map(p => {
      const roundPts = comp.rounds.map((_, ri) => {
        const rScores = (allScores[ri] || {})[p.id] || {};
        let pts = 0, holes = 0;
        Object.values(rScores).forEach(hs => {
          if (hs.gross > 0) { pts += hs.points || 0; holes++; }
        });
        return { pts, holes };
      });
      const totalPts    = roundPts.reduce((s, r) => s + r.pts, 0);
      const holesPlayed = roundPts.reduce((s, r) => s + r.holes, 0);
      return { ...p, roundPts, totalPts, holesPlayed, skins: skinCounts[p.id] || 0 };
    });

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

    let hcpDisplay;
    if (state.lbRound === 'overall') {
      hcpDisplay = `HCP ${t.handicap}`;
    } else {
      const round      = state.comp.rounds[state.lbRound];
      const playingHcp = getEffectiveHandicap(t, round);
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
// GOLF COURSE API
// =====================================================

async function searchCourse(blockId) {
  const query = $(`course-search-${blockId}`).value.trim();
  if (!query) return;

  const resultsEl = $(`course-results-${blockId}`);
  const teeEl     = $(`tee-selector-${blockId}`);
  teeEl.classList.add('hidden');
  resultsEl.innerHTML = '<p class="course-search-status">Searching…</p>';
  resultsEl.classList.remove('hidden');

  try {
    const res = await fetch(`${GOLF_API_BASE}/search?search_query=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Key ${GOLF_API_KEY}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const courses = data.courses || [];

    if (courses.length === 0) {
      resultsEl.innerHTML = '<p class="course-search-status">No courses found — try a different name.</p>';
      return;
    }

    resultsEl.innerHTML = '';
    courses.forEach(course => {
      const item = document.createElement('div');
      item.className = 'course-result-item';
      const location = course.location ? (course.location.city ? `${course.location.city}, ${course.location.country}` : course.location.country) : '';
      item.innerHTML = `
        <span class="course-result-name">${escHtml(course.club_name)}</span>
        <span class="course-result-sub">${escHtml(course.course_name || '')}${location ? ' · ' + escHtml(location) : ''}</span>
      `;
      item.onclick = () => loadCourseDetails(course.id, blockId);
      resultsEl.appendChild(item);
    });
  } catch (err) {
    resultsEl.innerHTML = `<p class="course-search-status course-search-error">Search failed: ${escHtml(err.message)}</p>`;
  }
}
window.searchCourse = searchCourse;

async function loadCourseDetails(courseId, blockId) {
  const resultsEl = $(`course-results-${blockId}`);
  const teeEl     = $(`tee-selector-${blockId}`);

  resultsEl.innerHTML = '<p class="course-search-status">Loading course details…</p>';
  teeEl.classList.add('hidden');

  try {
    const res = await fetch(`${GOLF_API_BASE}/courses/${courseId}`, {
      headers: { 'Authorization': `Key ${GOLF_API_KEY}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const course = data.course;

    const fullName = course.club_name + (course.course_name && course.course_name !== course.club_name ? ` — ${course.course_name}` : '');
    $(`round-name-${blockId}`).value = fullName;

    const teesObj  = course.tees || {};
    const maleTees = Array.isArray(teesObj.male) ? teesObj.male : [];
    const femaleTees = Array.isArray(teesObj.female) ? teesObj.female : [];
    const allTees  = [...maleTees, ...femaleTees];
    const tees     = maleTees.length > 0 ? maleTees : allTees;

    resultsEl.classList.add('hidden');

    if (tees.length === 0) {
      teeEl.innerHTML = '<p class="course-search-status">No tee data available for this course.</p>';
      teeEl.classList.remove('hidden');
      return;
    }

    teeEl.innerHTML = '<p class="tee-selector-label">Select your tee:</p>';
    tees.forEach(tee => {
      const btn = document.createElement('button');
      btn.className = 'tee-option-btn';
      btn.type = 'button';
      btn.innerHTML = `
        <span class="tee-name">${escHtml(tee.tee_name)}</span>
        <span class="tee-details">CR ${tee.course_rating} &middot; Slope ${tee.slope_rating} &middot; Par ${tee.par_total}</span>
      `;
      btn.onclick = () => applyTeeData(tee, blockId);
      teeEl.appendChild(btn);
    });
    teeEl.classList.remove('hidden');
  } catch (err) {
    resultsEl.innerHTML = `<p class="course-search-status course-search-error">Failed to load course: ${escHtml(err.message)}</p>`;
    resultsEl.classList.remove('hidden');
  }
}

function applyTeeData(tee, blockId) {
  $(`round-course-rating-${blockId}`).value = tee.course_rating || '';
  $(`round-slope-${blockId}`).value          = tee.slope_rating  || '';
  $(`round-course-par-${blockId}`).value     = tee.par_total     || '';

  if (tee.holes && tee.holes.length > 0) {
    const holes = tee.holes.slice(0, 18).map((hole, idx) => ({
      par: hole.par || DEFAULT_PARS[idx],
      si:  hole.handicap || (idx + 1),
    }));
    pendingCourseHoles[blockId] = holes;
    const statusEl = $(`course-status-${blockId}`);
    if (statusEl) statusEl.textContent = '✅ Holes set (from API)';
  }

  const teeEl = $(`tee-selector-${blockId}`);
  teeEl.innerHTML = `<p class="tee-selected-msg">✅ ${escHtml(tee.tee_name)} tee selected — all fields auto-filled!</p>`;
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
