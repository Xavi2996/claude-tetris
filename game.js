'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - azul pálido
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const RECORDS_KEY = 'tetris-records';
const STATS_KEY = 'tetris-stats';
const MAX_RECORDS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const recordsListEl = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const bestLinesEl = document.getElementById('best-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const nameEntryEl = document.getElementById('overlay-name-entry');
const nameInputEl = document.getElementById('player-name-input');
const saveRecordBtn = document.getElementById('save-record-btn');
const overlayRecordsEl = document.getElementById('overlay-records');
const overlayRecordsListEl = document.getElementById('overlay-records-list');
const overlayBestComboEl = document.getElementById('overlay-best-combo');
const overlayBestLinesEl = document.getElementById('overlay-best-lines');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, comboBest, pendingRecord;

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    return { bestCombo: raw?.bestCombo || 0, bestLines: raw?.bestLines || 0 };
  } catch {
    return { bestCombo: 0, bestLines: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function wouldQualify(recordScore, records) {
  if (records.length < MAX_RECORDS) return true;
  return recordScore > records[records.length - 1].score;
}

function renderRecordsInto(listEl, records, highlightObj) {
  listEl.innerHTML = '';
  if (records.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin récords aún';
    listEl.appendChild(li);
    return;
  }
  records.forEach(rec => {
    const li = document.createElement('li');
    if (rec === highlightObj) li.classList.add('highlight');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'rec-name';
    nameSpan.textContent = rec.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'rec-score';
    scoreSpan.textContent = rec.score.toLocaleString();
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    listEl.appendChild(li);
  });
}

function renderStatsInto(comboEl, linesEl2, stats) {
  comboEl.textContent = stats.bestCombo;
  linesEl2.textContent = stats.bestLines;
}

function refreshSidebarRecords() {
  renderRecordsInto(recordsListEl, loadRecords(), null);
  renderStatsInto(bestComboEl, bestLinesEl, loadStats());
}

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todos los récords?')) return;
  saveRecords([]);
  saveStats({ bestCombo: 0, bestLines: 0 });
  refreshSidebarRecords();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > comboBest) comboBest = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const stats = loadStats();
  stats.bestCombo = Math.max(stats.bestCombo, comboBest);
  stats.bestLines = Math.max(stats.bestLines, lines);
  saveStats(stats);

  const records = loadRecords();
  if (wouldQualify(score, records)) {
    pendingRecord = { score, lines, combo: comboBest };
    nameEntryEl.classList.remove('hidden');
    nameInputEl.value = '';
    overlayRecordsEl.classList.add('hidden');
    setTimeout(() => nameInputEl.focus(), 0);
  } else {
    pendingRecord = null;
    nameEntryEl.classList.add('hidden');
    overlayRecordsEl.classList.remove('hidden');
    renderRecordsInto(overlayRecordsListEl, records, null);
    renderStatsInto(overlayBestComboEl, overlayBestLinesEl, stats);
  }

  refreshSidebarRecords();
  overlay.classList.remove('hidden');
}

function saveRecord() {
  if (!pendingRecord) return;
  const name = nameInputEl.value.trim().slice(0, 12) || 'Jugador';
  const record = { name, score: pendingRecord.score, lines: pendingRecord.lines, combo: pendingRecord.combo };
  const records = loadRecords();
  records.push(record);
  records.sort((a, b) => b.score - a.score);
  records.length = Math.min(records.length, MAX_RECORDS);
  saveRecords(records);
  pendingRecord = null;

  nameEntryEl.classList.add('hidden');
  overlayRecordsEl.classList.remove('hidden');
  renderRecordsInto(overlayRecordsListEl, records, records.includes(record) ? record : null);
  renderStatsInto(overlayBestComboEl, overlayBestLinesEl, loadStats());
  refreshSidebarRecords();
}

saveRecordBtn.addEventListener('click', saveRecord);
nameInputEl.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveRecord();
});

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  comboBest = 0;
  pendingRecord = null;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntryEl.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  refreshSidebarRecords();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Tema claro/oscuro ----
const THEME_KEY = 'tetris-theme';
const themeToggleBtn = document.getElementById('theme-toggle');
let gridColor = '#22222e';

function readGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim() || gridColor;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  gridColor = readGridColor();
  themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
  themeToggleBtn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
}

themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

init();
