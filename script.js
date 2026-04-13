var states = [];
var transitions = [];
var startState = null;
var mode = 'add-state';
var nextId = 1;

var dragState = null;
var dragOffsetX = 0;
var dragOffsetY = 0;
var transFrom = null;
var mousePos = { x: -999, y: -999 };
var ctxTarget = null;
var hoverState = null;

var simInput = '';
var simStep = 0;
var simCurrentStates = new Set();
var simRunning = false;
var simInterval = null;
var simDone = false;
var lastUsedTransId = null;

var suggestedPos = null;

var STATE_RADIUS = 28;

var deadStates = new Set();
var showDeadStates = true;
var trapState = null;
var showTrapState = false;

var canvas, ctx2d, canvasWrap;
var btnAddState, btnAddTrans, btnSetStart, btnToggleAccept, btnClear;
var btnLoadDFA, btnLoadNFA, modeBadge, guideText, toastContainer, btnCancelTrans;
var btnExport, btnImport, importFileInput;
var stateNameInput, btnAddStateManual, stateListUl, stateEmptyMsg;
var transListUl, transEmptyMsg;
var simInputEl, btnStep, btnRun, btnReset, tapeDiv, stepInfoDiv, resultBox;
var ctxMenu, transPopup, transSymbolsInput, transConfirm, transCancelBtn;
var btnToggleDead, btnToggleTrap, deadCountBadge;

window.addEventListener('DOMContentLoaded', function() {
  canvas = document.getElementById('canvas');
  ctx2d = canvas.getContext('2d');
  canvasWrap = document.getElementById('canvas-wrap');

  btnAddState = document.getElementById('btn-add-state');
  btnAddTrans = document.getElementById('btn-add-trans');
  btnSetStart = document.getElementById('btn-set-start');
  btnToggleAccept = document.getElementById('btn-toggle-accept');
  btnClear = document.getElementById('btn-clear');
  btnLoadDFA = document.getElementById('btn-load-dfa');
  btnLoadNFA = document.getElementById('btn-load-nfa');
  btnExport = document.getElementById('btn-export');
  btnImport = document.getElementById('btn-import');
  importFileInput = document.getElementById('import-file');
  modeBadge = document.getElementById('mode-badge');
  guideText = document.getElementById('guide-text');
  toastContainer = document.getElementById('toast-container');
  btnCancelTrans = document.getElementById('btn-cancel-trans');

  stateNameInput = document.getElementById('state-name-input');
  btnAddStateManual = document.getElementById('btn-add-state-manual');
  stateListUl = document.getElementById('state-list');
  stateEmptyMsg = document.getElementById('state-empty-msg');
  transListUl = document.getElementById('trans-list');
  transEmptyMsg = document.getElementById('trans-empty-msg');

  simInputEl = document.getElementById('sim-input');
  btnStep = document.getElementById('btn-step');
  btnRun = document.getElementById('btn-run');
  btnReset = document.getElementById('btn-reset');
  tapeDiv = document.getElementById('tape');
  stepInfoDiv = document.getElementById('step-info');
  resultBox = document.getElementById('result-box');

  ctxMenu = document.getElementById('ctx-menu');
  transPopup = document.getElementById('trans-popup');
  transSymbolsInput = document.getElementById('trans-symbols-input');
  transConfirm = document.getElementById('trans-confirm');
  transCancelBtn = document.getElementById('trans-cancel');

  btnToggleDead = document.getElementById('btn-toggle-dead');
  btnToggleTrap = document.getElementById('btn-toggle-trap');
  deadCountBadge = document.getElementById('dead-count-badge');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  btnAddState.addEventListener('click', function() {
    setMode('add-state');
  });
  btnAddTrans.addEventListener('click', function() {
    setMode('add-trans');
    showToast('Click a source state, then a destination state.', 'info');
  });
  btnSetStart.addEventListener('click', function() {
    setMode('set-start');
    showToast('Click a state to set it as the start state.', 'info');
  });
  btnToggleAccept.addEventListener('click', function() {
    setMode('toggle-accept');
    showToast('Click a state to toggle accept.', 'info');
  });
  btnClear.addEventListener('click', function() {
    states = []; transitions = []; startState = null; nextId = 1; transFrom = null;
    suggestedPos = null; trapState = null;
    simReset(); computeDeadStates(); renderStateList(); renderTransList(); detectMode(); updateGuide(); draw();
    showToast('Canvas cleared.', 'warn');
  });

  btnToggleDead.addEventListener('click', function() {
    showDeadStates = !showDeadStates;
    btnToggleDead.classList.toggle('active', showDeadStates);
    showToast(showDeadStates ? 'Dead state highlighting ON' : 'Dead state highlighting OFF', showDeadStates ? 'info' : 'warn');
    draw();
  });

  btnToggleTrap.addEventListener('click', function() {
    showTrapState = !showTrapState;
    btnToggleTrap.classList.toggle('active', showTrapState);
    if (showTrapState) {
      createTrapState();
      showToast('Trap state enabled — missing transitions route here.', 'info');
    } else {
      removeTrapState();
      showToast('Trap state removed.', 'warn');
    }
    computeDeadStates(); renderStateList(); renderTransList(); detectMode(); updateGuide(); draw();
  });

  btnLoadDFA.addEventListener('click', loadDFA);
  btnLoadNFA.addEventListener('click', loadNFA);

  btnExport.addEventListener('click', exportJSON);
  btnImport.addEventListener('click', function() { importFileInput.click(); });
  importFileInput.addEventListener('change', importJSON);

  btnAddStateManual.addEventListener('click', addStateManual);
  stateNameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') addStateManual(); });

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('contextmenu', onCtx);

  document.addEventListener('click', function() { ctxMenu.style.display = 'none'; });
  ctxMenu.addEventListener('click', onCtxAction);

  transConfirm.addEventListener('click', confirmTrans);
  transSymbolsInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') confirmTrans();
    if (e.key === 'Escape') cancelTrans();
  });
  transCancelBtn.addEventListener('click', cancelTrans);

  btnCancelTrans.addEventListener('click', cancelSourceSelection);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (transPopup.style.display === 'block') { cancelTrans(); return; }
      if (mode === 'add-trans' && transFrom !== null) { cancelSourceSelection(); return; }
    }
  });

  btnStep.addEventListener('click', function() {
    if (simDone) return;
    if (!simCurrentStates.size) simInit();
    else stepForward();
  });
  btnRun.addEventListener('click', function() {
    if (simRunning) { clearInterval(simInterval); simRunning = false; btnRun.textContent = '▶ Run'; return; }
    if (!simCurrentStates.size) simInit();
    if (simDone) return;
    simRunning = true;
    btnRun.textContent = '⏸ Pause';
    simInterval = setInterval(function() {
      if (simDone) { clearInterval(simInterval); simRunning = false; btnRun.textContent = '▶ Run'; return; }
      stepForward();
    }, 600);
  });
  btnReset.addEventListener('click', simReset);

  autoLoad();
  setMode('add-state');
  computeDeadStates();
  detectMode();
  renderStateList();
  renderTransList();
  updateGuide();
  draw();

  btnToggleDead.classList.toggle('active', showDeadStates);

  requestAnimationFrame(animLoop);
});

function showToast(msg, type) {
  var el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 3200);
}

function updateGuide() {
  var text = '';
  if (states.length === 0) {
    text = '👋 Click anywhere on the canvas to add your first state!';
  } else if (states.length === 1 && transitions.length === 0) {
    text = '✨ Great! Now add another state, or click "→ Add Transition" to connect states.';
  } else if (states.length >= 2 && transitions.length === 0) {
    text = '🔗 Click "→ Add Transition", then click source state → destination state.';
  } else if (mode === 'add-trans' && transFrom === null) {
    text = '🎯 Click on the SOURCE state (where the transition starts).';
  } else if (mode === 'add-trans' && transFrom !== null) {
    var s = getStateById(transFrom);
    text = '🎯 Now click the DESTINATION state to connect from ' + (s ? s.name : '?') + '.';
  } else if (mode === 'set-start') {
    text = '▶ Click on any state to make it the start state.';
  } else if (mode === 'toggle-accept') {
    text = '◎ Click on any state to toggle it as an accept/final state.';
  } else if (transitions.length > 0 && !startState) {
    text = '⚠ No start state! Click "▶ Set Start" then click a state.';
  } else if (transitions.length > 0 && !states.some(function(s) { return s.accept; })) {
    text = '💡 No accept states yet. Click "◎ Toggle Accept" then click a state.';
  } else if (transitions.length > 0 && startState && states.some(function(s) { return s.accept; })) {
    text = '✅ Ready! Type an input string in the side panel and hit "▶ Run".';
  } else if (mode === 'add-state') {
    text = '◉ Click on the canvas to place a new state. Drag existing states to move.';
  }
  guideText.textContent = text;
  btnCancelTrans.style.display = (mode === 'add-trans' && transFrom !== null) ? 'inline-block' : 'none';
}

function cancelSourceSelection() {
  transFrom = null;
  showToast('Source deselected.', 'warn');
  updateGuide();
  draw();
}

function resizeCanvas() {
  var dpr = window.devicePixelRatio || 1;
  var cw = canvasWrap.clientWidth;
  var ch = canvasWrap.clientHeight;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function generateId() { return nextId++; }
function CW() { return canvasWrap.clientWidth; }
function CH() { return canvasWrap.clientHeight; }

function getStateAt(x, y) {
  for (var i = states.length - 1; i >= 0; i--) {
    var s = states[i];
    var dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy <= STATE_RADIUS * STATE_RADIUS) return s;
  }
  return null;
}

function getStateById(id) {
  for (var i = 0; i < states.length; i++) {
    if (states[i].id === id) return states[i];
  }
  return null;
}

function hasOverlap(x, y, ignoreId) {
  for (var i = 0; i < states.length; i++) {
    var s = states[i];
    if (s.id === ignoreId) continue;
    var dx = s.x - x, dy = s.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < STATE_RADIUS * 2 + 10) return true;
  }
  return false;
}

var modeButtons = {};

function setMode(m) {
  mode = m;
  transFrom = null;
  if (m !== 'add-state') suggestedPos = null;
  modeButtons = {
    'add-state': btnAddState,
    'add-trans': btnAddTrans,
    'set-start': btnSetStart,
    'toggle-accept': btnToggleAccept,
  };
  var keys = Object.keys(modeButtons);
  for (var i = 0; i < keys.length; i++) {
    modeButtons[keys[i]].classList.remove('active');
  }
  if (modeButtons[m]) modeButtons[m].classList.add('active');
  if (m === 'add-state') {
    suggestedPos = findSmartPosition();
  }
  updateGuide();
  draw();
}

function findSmartPosition() {
  var cw = CW(), ch = CH();
  var cx = Math.round(cw / 2), cy = Math.round(ch / 2);
  if (states.length === 0) return { x: cx, y: cy };

  var count = states.length;
  var radius = Math.min(cw, ch) * 0.25;
  var angle = (count * (2 * Math.PI / 8)) - Math.PI / 2;
  var x = Math.round(cx + radius * Math.cos(angle));
  var y = Math.round(cy + radius * Math.sin(angle));
  x = Math.max(STATE_RADIUS + 50, Math.min(cw - STATE_RADIUS - 10, x));
  y = Math.max(STATE_RADIUS + 10, Math.min(ch - STATE_RADIUS - 50, y));

  var tries = 0;
  while (hasOverlap(x, y) && tries < 30) {
    x += 70;
    if (x > cw - STATE_RADIUS - 10) { x = STATE_RADIUS + 80; y += 70; }
    tries++;
  }
  return { x: x, y: y };
}

function addStateManual() {
  var name = stateNameInput.value.trim();
  if (!name) return;
  var x = 160, y = 160;
  while (hasOverlap(x, y)) {
    x += 80;
    if (x > CW() - 80) { x = 160; y += 80; }
  }
  var s = { id: generateId(), name: name, x: x, y: y, accept: false };
  states.push(s);
  if (!startState) startState = s.id;
  stateNameInput.value = '';
  showToast('State "' + name + '" added!', 'success');
  suggestedPos = null;
  computeDeadStates(); renderStateList(); detectMode(); updateGuide(); draw();
}

function canvasCoords(e) {
  var r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onDown(e) {
  if (e.button !== 0) return;
  var pos = canvasCoords(e);
  var x = pos.x, y = pos.y;
  var s = getStateAt(x, y);

  if (mode === 'add-state') {
    if (!s && !hasOverlap(x, y)) {
      var name = 'q' + states.length;
      var ns = { id: generateId(), name: name, x: x, y: y, accept: false };
      states.push(ns);
      if (states.length === 1) {
        startState = ns.id;
        showToast('State "' + name + '" created! Auto-set as start state.', 'success');
      } else {
        showToast('State "' + name + '" added!', 'success');
      }
      suggestedPos = findSmartPosition();
      computeDeadStates(); renderStateList(); detectMode(); updateGuide(); draw();
    } else if (s) {
      startDrag(s, x, y);
    }
  } else if (mode === 'add-trans') {
    if (s) {
      if (transFrom === null) {
        transFrom = s.id;
        showToast('Source: ' + s.name + '. Now click the destination.', 'info');
        updateGuide(); draw();
      } else {
        openTransPopup(e.clientX, e.clientY, transFrom, s.id);
      }
    }
  } else if (mode === 'set-start') {
    if (s) {
      startState = s.id;
      showToast(s.name + ' is now the start state!', 'success');
      computeDeadStates(); renderStateList(); updateGuide(); draw();
    }
  } else if (mode === 'toggle-accept') {
    if (s) {
      s.accept = !s.accept;
      showToast(s.name + (s.accept ? ' → accept state!' : ' → normal state.'), s.accept ? 'success' : 'warn');
      computeDeadStates(); renderStateList(); updateGuide(); draw();
    }
  } else if (s) {
    startDrag(s, x, y);
  }
}

function startDrag(s, x, y) {
  dragState = s;
  dragOffsetX = x - s.x;
  dragOffsetY = y - s.y;
  canvas.style.cursor = 'grabbing';
}

function onMove(e) {
  var pos = canvasCoords(e);
  mousePos = { x: pos.x, y: pos.y };

  if (dragState) {
    dragState.x = pos.x - dragOffsetX;
    dragState.y = pos.y - dragOffsetY;
    draw();
  } else {
    var oldHover = hoverState;
    hoverState = getStateAt(pos.x, pos.y);
    if (hoverState !== oldHover) draw();
    canvas.style.cursor = hoverState ? (mode === 'add-state' ? 'grab' : 'pointer') : 'crosshair';
    if (mode === 'add-trans' && transFrom !== null) draw();
  }
}

function onUp() {
  if (dragState) { dragState = null; canvas.style.cursor = 'crosshair'; }
}

function onLeave() {
  mousePos = { x: -999, y: -999 };
  hoverState = null;
  draw();
}

function onDbl(e) {
  e.preventDefault();
  var pos = canvasCoords(e);
  if (getStateAt(pos.x, pos.y) || hasOverlap(pos.x, pos.y)) return;
  var ns = { id: generateId(), name: 'q' + states.length, x: pos.x, y: pos.y, accept: false };
  states.push(ns);
  if (!startState) startState = ns.id;
  suggestedPos = null;
  showToast('State "' + ns.name + '" added!', 'success');
  computeDeadStates(); renderStateList(); detectMode(); updateGuide(); draw();
}

function onCtx(e) {
  e.preventDefault();
  var pos = canvasCoords(e);
  var s = getStateAt(pos.x, pos.y);
  if (!s) { ctxMenu.style.display = 'none'; return; }
  ctxTarget = s;
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.style.display = 'block';
}

function onCtxAction(e) {
  var action = e.target.getAttribute('data-action');
  if (!action || !ctxTarget) return;

  if (action === 'set-start') {
    startState = ctxTarget.id;
    showToast(ctxTarget.name + ' → start state!', 'success');
  } else if (action === 'toggle-accept') {
    ctxTarget.accept = !ctxTarget.accept;
    showToast(ctxTarget.name + (ctxTarget.accept ? ' → accept' : ' → normal'), 'success');
  } else if (action === 'rename') {
    var n = prompt('New name:', ctxTarget.name);
    if (n !== null && n.trim()) { ctxTarget.name = n.trim(); showToast('Renamed to ' + n.trim(), 'success'); }
  } else if (action === 'delete') {
    var nm = ctxTarget.name;
    var id = ctxTarget.id;
    states = states.filter(function(s) { return s.id !== id; });
    transitions = transitions.filter(function(t) { return t.from !== id && t.to !== id; });
    if (startState === id) startState = states.length ? states[0].id : null;
    showToast('Deleted "' + nm + '"', 'warn');
  }
  ctxTarget = null; ctxMenu.style.display = 'none';
  computeDeadStates(); renderStateList(); renderTransList(); detectMode(); updateGuide(); draw();
}

var pendingTransFrom = null;
var pendingTransTo = null;

function openTransPopup(px, py, fromId, toId) {
  pendingTransFrom = fromId;
  pendingTransTo = toId;
  transSymbolsInput.value = '';
  var left = Math.min(px + 10, window.innerWidth - 300);
  var top = Math.max(py - 30, 50);
  transPopup.style.left = left + 'px';
  transPopup.style.top = top + 'px';
  transPopup.style.display = 'block';
  setTimeout(function() { transSymbolsInput.focus(); }, 50);
}

function confirmTrans() {
  var raw = transSymbolsInput.value.trim();
  if (!raw) { cancelTrans(); return; }
  var symbols = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (!symbols.length) { cancelTrans(); return; }

  var existing = null;
  for (var i = 0; i < transitions.length; i++) {
    if (transitions[i].from === pendingTransFrom && transitions[i].to === pendingTransTo) {
      existing = transitions[i]; break;
    }
  }

  if (existing) {
    for (var j = 0; j < symbols.length; j++) {
      if (existing.symbols.indexOf(symbols[j]) === -1) existing.symbols.push(symbols[j]);
    }
  } else {
    transitions.push({ id: generateId(), from: pendingTransFrom, to: pendingTransTo, symbols: symbols });
  }

  var fromS = getStateById(pendingTransFrom);
  var toS = getStateById(pendingTransTo);
  showToast((fromS ? fromS.name : '?') + ' → ' + (toS ? toS.name : '?') + ' on {' + symbols.join(', ') + '}', 'success');

  transPopup.style.display = 'none';
  transFrom = null; pendingTransFrom = null; pendingTransTo = null;
  computeDeadStates(); renderTransList(); detectMode(); updateGuide(); draw();
}

function cancelTrans() {
  transPopup.style.display = 'none';
  transFrom = null; pendingTransFrom = null; pendingTransTo = null;
  updateGuide(); draw();
}

function isEpsilon(sym) { return sym === 'ε' || sym === 'e' || sym === 'epsilon'; }

function detectMode() {
  var nfa = false;
  for (var i = 0; i < transitions.length; i++) {
    for (var j = 0; j < transitions[i].symbols.length; j++) {
      if (isEpsilon(transitions[i].symbols[j])) { nfa = true; break; }
    }
    if (nfa) break;
  }
  if (!nfa) {
    for (var si = 0; si < states.length; si++) {
      var map = {};
      for (var ti = 0; ti < transitions.length; ti++) {
        if (transitions[ti].from !== states[si].id) continue;
        for (var sj = 0; sj < transitions[ti].symbols.length; sj++) {
          var sym = transitions[ti].symbols[sj];
          if (map[sym]) { nfa = true; break; }
          map[sym] = true;
        }
        if (nfa) break;
      }
      if (nfa) break;
    }
  }
  modeBadge.textContent = nfa ? 'NFA' : 'DFA';
  modeBadge.className = nfa ? 'badge-nfa' : 'badge-dfa';
}

function renderStateList() {
  stateListUl.innerHTML = '';
  stateEmptyMsg.style.display = states.length ? 'none' : 'block';
  for (var i = 0; i < states.length; i++) {
    var s = states[i];
    var li = document.createElement('li');
    var dot = document.createElement('span');
    dot.className = 'dot';
    var isStart = s.id === startState;
    var isAccept = s.accept;
    var isDead = deadStates.has(s.id);
    if (isDead) dot.classList.add('dot-dead');
    else if (isStart && isAccept) dot.classList.add('dot-both');
    else if (isStart) dot.classList.add('dot-start');
    else if (isAccept) dot.classList.add('dot-accept');
    else dot.classList.add('dot-normal');
    var label = document.createElement('span');
    var txt = s.name;
    if (isStart) txt += ' (start)';
    if (isAccept) txt += ' (accept)';
    if (isDead) txt += ' (dead)';
    if (s.isTrap) txt += ' (trap)';
    label.textContent = txt;
    if (isDead) li.classList.add('dead-state-item');
    li.appendChild(dot);
    li.appendChild(label);
    stateListUl.appendChild(li);
  }
  deadCountBadge.textContent = deadStates.size;
  deadCountBadge.style.display = deadStates.size > 0 ? 'inline-block' : 'none';
}

function renderTransList() {
  transListUl.innerHTML = '';
  transEmptyMsg.style.display = transitions.length ? 'none' : 'block';
  for (var i = 0; i < transitions.length; i++) {
    var t = transitions[i];
    var from = getStateById(t.from);
    var to = getStateById(t.to);
    if (!from || !to) continue;
    var li = document.createElement('li');
    li.innerHTML = from.name + ' <span class="trans-arrow">→</span> ' + to.name +
      ' <span class="trans-symbols">' + t.symbols.join(', ') + '</span>';
    transListUl.appendChild(li);
  }
}

function epsilonClosure(ids) {
  var closure = new Set(ids);
  var stack = Array.from(ids);
  while (stack.length) {
    var sid = stack.pop();
    for (var i = 0; i < transitions.length; i++) {
      var t = transitions[i];
      if (t.from !== sid) continue;
      var hasEps = false;
      for (var j = 0; j < t.symbols.length; j++) {
        if (isEpsilon(t.symbols[j])) { hasEps = true; break; }
      }
      if (!hasEps) continue;
      if (!closure.has(t.to)) { closure.add(t.to); stack.push(t.to); }
    }
  }
  return closure;
}

function simInit() {
  if (startState === null) { showToast('No start state! Set one first.', 'warn'); return; }
  simInput = simInputEl.value;
  simStep = 0; simDone = false; lastUsedTransId = null;
  resultBox.className = ''; resultBox.style.display = 'none'; resultBox.textContent = '';

  simCurrentStates = epsilonClosure(new Set([startState]));

  tapeDiv.innerHTML = '';
  for (var i = 0; i < simInput.length; i++) {
    var cell = document.createElement('div');
    cell.className = 'tape-cell';
    cell.textContent = simInput[i];
    tapeDiv.appendChild(cell);
  }

  stepInfoDiv.textContent = '▶ Start: ' + setNames(simCurrentStates);
  showToast('Simulation started! Input: "' + (simInput || 'ε') + '"', 'info');
  draw();
  if (simInput.length === 0) checkAcceptance();
}

function stepForward() {
  if (simDone) return;
  if (simStep >= simInput.length) { checkAcceptance(); return; }

  var symbol = simInput[simStep];
  var cells = tapeDiv.children;
  for (var i = 0; i < cells.length; i++) {
    cells[i].classList.remove('current');
    if (i < simStep) cells[i].classList.add('done');
  }
  if (cells[simStep]) cells[simStep].classList.add('current');

  var prev = setNames(simCurrentStates);
  var next = new Set();
  lastUsedTransId = null;
  simCurrentStates.forEach(function(sid) {
    for (var i = 0; i < transitions.length; i++) {
      var t = transitions[i];
      if (t.from !== sid) continue;
      if (t.symbols.indexOf(symbol) !== -1) {
        next.add(t.to);
        lastUsedTransId = t.id;
      }
    }
  });

  simCurrentStates = epsilonClosure(next);
  stepInfoDiv.textContent = "Read '" + symbol + "':  " + prev + '  →  ' + setNames(simCurrentStates);
  simStep++;

  if (cells[simStep - 1]) { cells[simStep - 1].classList.remove('current'); cells[simStep - 1].classList.add('done'); }

  var allDead = simCurrentStates.size > 0 && allInDeadStates(simCurrentStates);
  if (simCurrentStates.size === 0 || allDead) {
    simDone = true;
    var reason = simCurrentStates.size === 0 ? 'No active states — string rejected.' : 'All active states are dead (cannot reach accept) — early rejection.';
    resultBox.textContent = '✗  REJECTED';
    resultBox.className = 'reject';
    resultBox.style.display = 'block';
    stepInfoDiv.textContent += '\n💀 ' + reason;
    showToast('💀 ' + reason, 'warn');
    if (simRunning) { clearInterval(simInterval); simRunning = false; btnRun.textContent = '▶ Run'; }
    draw();
    return;
  }

  if (simStep >= simInput.length) checkAcceptance();
  draw();
}

function allInDeadStates(stateSet) {
  var allDead = true;
  stateSet.forEach(function(sid) {
    if (!deadStates.has(sid)) allDead = false;
  });
  return allDead;
}

function checkAcceptance() {
  simDone = true;
  var accepted = false;
  simCurrentStates.forEach(function(sid) {
    var s = getStateById(sid);
    if (s && s.accept) accepted = true;
  });
  resultBox.textContent = accepted ? '✓  ACCEPTED' : '✗  REJECTED';
  resultBox.className = accepted ? 'accept' : 'reject';
  resultBox.style.display = 'block';
  showToast(accepted ? 'String ACCEPTED!' : 'String REJECTED.', accepted ? 'success' : 'warn');
  if (simRunning) { clearInterval(simInterval); simRunning = false; btnRun.textContent = '▶ Run'; }
  draw();
}

function simReset() {
  simCurrentStates = new Set(); simStep = 0; simDone = false; simRunning = false; lastUsedTransId = null;
  if (simInterval) clearInterval(simInterval);
  btnRun.textContent = '▶ Run';
  tapeDiv.innerHTML = ''; stepInfoDiv.textContent = '';
  resultBox.className = ''; resultBox.style.display = 'none'; resultBox.textContent = '';
  draw();
}

function setNames(set) {
  if (set.size === 0) return '∅';
  var names = [];
  set.forEach(function(sid) { var s = getStateById(sid); if (s) names.push(s.name); });
  return names.length === 1 ? names[0] : '{' + names.join(', ') + '}';
}

function loadDFA() {
  states = []; transitions = []; nextId = 1; suggestedPos = null; simReset();
  var cy = Math.round(CH() / 2);
  var q0 = { id: generateId(), name: 'q0', x: 200, y: cy, accept: false };
  var q1 = { id: generateId(), name: 'q1', x: 460, y: cy, accept: true };
  states.push(q0, q1);
  startState = q0.id;
  transitions.push({ id: generateId(), from: q0.id, to: q0.id, symbols: ['0'] });
  transitions.push({ id: generateId(), from: q0.id, to: q1.id, symbols: ['1'] });
  transitions.push({ id: generateId(), from: q1.id, to: q0.id, symbols: ['0'] });
  transitions.push({ id: generateId(), from: q1.id, to: q1.id, symbols: ['1'] });
  showToast('DFA loaded! Accepts strings ending in 1.', 'success');
  computeDeadStates(); renderStateList(); renderTransList(); detectMode(); updateGuide(); draw();
}

function loadNFA() {
  states = []; transitions = []; nextId = 1; suggestedPos = null; simReset();
  var cy = Math.round(CH() / 2);
  var q0 = { id: generateId(), name: 'q0', x: 140, y: cy, accept: false };
  var q1 = { id: generateId(), name: 'q1', x: 340, y: cy - 90, accept: false };
  var q2 = { id: generateId(), name: 'q2', x: 340, y: cy + 90, accept: false };
  var q3 = { id: generateId(), name: 'q3', x: 540, y: cy, accept: true };
  states.push(q0, q1, q2, q3);
  startState = q0.id;
  transitions.push({ id: generateId(), from: q0.id, to: q1.id, symbols: ['a'] });
  transitions.push({ id: generateId(), from: q0.id, to: q2.id, symbols: ['a'] });
  transitions.push({ id: generateId(), from: q1.id, to: q3.id, symbols: ['b'] });
  transitions.push({ id: generateId(), from: q2.id, to: q3.id, symbols: ['c'] });
  showToast('NFA loaded! Try "ab" or "ac".', 'success');
  computeDeadStates(); renderStateList(); renderTransList(); detectMode(); updateGuide(); draw();
}

function draw() {
  if (!ctx2d) return;
  var w = CW(), h = CH();
  ctx2d.clearRect(0, 0, w, h);

  ctx2d.fillStyle = '#1E2231';
  for (var x = 25; x < w; x += 25) {
    for (var y = 25; y < h; y += 25) {
      ctx2d.beginPath(); ctx2d.arc(x, y, 0.8, 0, Math.PI * 2); ctx2d.fill();
    }
  }

  if (suggestedPos && mode === 'add-state') {
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);

    var grd = ctx2d.createRadialGradient(suggestedPos.x, suggestedPos.y, STATE_RADIUS - 5, suggestedPos.x, suggestedPos.y, STATE_RADIUS + 18);
    grd.addColorStop(0, 'rgba(108,156,255,' + (0.12 + pulse * 0.12) + ')');
    grd.addColorStop(1, 'rgba(108,156,255,0)');
    ctx2d.beginPath(); ctx2d.arc(suggestedPos.x, suggestedPos.y, STATE_RADIUS + 18, 0, Math.PI * 2);
    ctx2d.fillStyle = grd; ctx2d.fill();

    ctx2d.beginPath(); ctx2d.arc(suggestedPos.x, suggestedPos.y, STATE_RADIUS, 0, Math.PI * 2);
    ctx2d.fillStyle = 'rgba(108,156,255,0.08)'; ctx2d.fill();
    ctx2d.lineWidth = 2;
    ctx2d.strokeStyle = 'rgba(108,156,255,' + (0.3 + pulse * 0.3) + ')';
    ctx2d.setLineDash([6, 4]); ctx2d.stroke(); ctx2d.setLineDash([]);

    ctx2d.fillStyle = 'rgba(108,156,255,' + (0.4 + pulse * 0.3) + ')';
    ctx2d.font = '600 13px Inter, system-ui';
    ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    ctx2d.fillText('q' + states.length, suggestedPos.x, suggestedPos.y);

    ctx2d.fillStyle = 'rgba(108,156,255,' + (0.3 + pulse * 0.2) + ')';
    ctx2d.font = '500 10px Inter, system-ui';
    ctx2d.fillText('click to add', suggestedPos.x, suggestedPos.y + STATE_RADIUS + 14);
  }

  if (mode === 'add-state' && mousePos.x > 0 && !hoverState && !dragState && !hasOverlap(mousePos.x, mousePos.y)) {
    ctx2d.beginPath(); ctx2d.arc(mousePos.x, mousePos.y, STATE_RADIUS, 0, Math.PI * 2);
    ctx2d.fillStyle = 'rgba(108,156,255,0.06)'; ctx2d.fill();
    ctx2d.lineWidth = 2; ctx2d.strokeStyle = 'rgba(108,156,255,0.2)';
    ctx2d.setLineDash([6, 4]); ctx2d.stroke(); ctx2d.setLineDash([]);
    ctx2d.fillStyle = 'rgba(108,156,255,0.3)'; ctx2d.font = '500 12px Inter, system-ui';
    ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    ctx2d.fillText('q' + states.length, mousePos.x, mousePos.y);
  }

  for (var i = 0; i < transitions.length; i++) drawTransition(transitions[i]);

  if (mode === 'add-trans' && transFrom !== null) {
    var s = getStateById(transFrom);
    if (s) {
      ctx2d.strokeStyle = 'rgba(108,156,255,0.4)'; ctx2d.lineWidth = 2;
      ctx2d.setLineDash([6, 6]);
      ctx2d.beginPath(); ctx2d.moveTo(s.x, s.y); ctx2d.lineTo(mousePos.x, mousePos.y); ctx2d.stroke();
      ctx2d.setLineDash([]);
    }
  }

  for (var j = 0; j < states.length; j++) drawState(states[j]);
}

function drawState(s) {
  var isCurrent = simCurrentStates.has(s.id);
  var isStart = s.id === startState;
  var isHover = hoverState && hoverState.id === s.id;
  var isDead = showDeadStates && deadStates.has(s.id);

  if (isCurrent && isDead) {
    var grdDead = ctx2d.createRadialGradient(s.x, s.y, STATE_RADIUS, s.x, s.y, STATE_RADIUS + 16);
    grdDead.addColorStop(0, 'rgba(239,68,68,0.3)'); grdDead.addColorStop(1, 'rgba(239,68,68,0)');
    ctx2d.beginPath(); ctx2d.arc(s.x, s.y, STATE_RADIUS + 16, 0, Math.PI * 2);
    ctx2d.fillStyle = grdDead; ctx2d.fill();
  } else if (isCurrent) {
    var grd = ctx2d.createRadialGradient(s.x, s.y, STATE_RADIUS, s.x, s.y, STATE_RADIUS + 16);
    grd.addColorStop(0, 'rgba(245,158,11,0.3)'); grd.addColorStop(1, 'rgba(245,158,11,0)');
    ctx2d.beginPath(); ctx2d.arc(s.x, s.y, STATE_RADIUS + 16, 0, Math.PI * 2);
    ctx2d.fillStyle = grd; ctx2d.fill();
  } else if (isDead) {
    var grdD = ctx2d.createRadialGradient(s.x, s.y, STATE_RADIUS, s.x, s.y, STATE_RADIUS + 12);
    grdD.addColorStop(0, 'rgba(239,68,68,0.12)'); grdD.addColorStop(1, 'rgba(239,68,68,0)');
    ctx2d.beginPath(); ctx2d.arc(s.x, s.y, STATE_RADIUS + 12, 0, Math.PI * 2);
    ctx2d.fillStyle = grdD; ctx2d.fill();
  } else if (isHover) {
    var grd2 = ctx2d.createRadialGradient(s.x, s.y, STATE_RADIUS, s.x, s.y, STATE_RADIUS + 10);
    grd2.addColorStop(0, 'rgba(108,156,255,0.12)'); grd2.addColorStop(1, 'rgba(108,156,255,0)');
    ctx2d.beginPath(); ctx2d.arc(s.x, s.y, STATE_RADIUS + 10, 0, Math.PI * 2);
    ctx2d.fillStyle = grd2; ctx2d.fill();
  }

  ctx2d.beginPath(); ctx2d.arc(s.x, s.y, STATE_RADIUS, 0, Math.PI * 2);
  if (isDead) {
    ctx2d.fillStyle = 'rgba(239,68,68,0.06)'; ctx2d.fill();
    ctx2d.lineWidth = isCurrent ? 3 : (isHover ? 2.5 : 2);
    ctx2d.strokeStyle = isCurrent ? '#EF4444' : (isHover ? '#F87171' : 'rgba(239,68,68,0.5)');
    ctx2d.setLineDash(s.isTrap ? [5, 4] : []);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
  } else {
    ctx2d.fillStyle = '#1A1D2A'; ctx2d.fill();
    ctx2d.lineWidth = isCurrent ? 3 : (isHover ? 2.5 : 2);
    ctx2d.strokeStyle = isCurrent ? '#F59E0B' : (isHover ? '#6C9CFF' : '#3B4252');
    ctx2d.stroke();
  }

  if (s.accept) {
    ctx2d.beginPath(); ctx2d.arc(s.x, s.y, STATE_RADIUS - 5, 0, Math.PI * 2);
    ctx2d.lineWidth = 1.5; ctx2d.strokeStyle = '#34D399'; ctx2d.stroke();
  }

  if (isStart) {
    var ax = s.x - STATE_RADIUS;
    ctx2d.strokeStyle = '#6C9CFF'; ctx2d.lineWidth = 2;
    ctx2d.beginPath(); ctx2d.moveTo(ax - 36, s.y); ctx2d.lineTo(ax, s.y); ctx2d.stroke();
    drawArrowHead(ax - 36, s.y, ax, s.y, '#6C9CFF', 9);
  }

  if (isDead) {
    ctx2d.fillStyle = isCurrent ? '#FCA5A5' : 'rgba(248,113,113,0.7)';
    ctx2d.font = '600 13px Inter, system-ui';
    ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    ctx2d.fillText(s.name, s.x, s.y - 4);
    ctx2d.font = '10px Inter, system-ui';
    ctx2d.fillStyle = 'rgba(248,113,113,0.5)';
    ctx2d.fillText(s.isTrap ? 'trap' : 'dead', s.x, s.y + 10);
  } else {
    ctx2d.fillStyle = isCurrent ? '#FCD34D' : (isHover ? '#B8D4FF' : '#E2E8F0');
    ctx2d.font = '600 13px Inter, system-ui';
    ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
    ctx2d.fillText(s.name, s.x, s.y);
  }
}

function drawTransition(t) {
  var from = getStateById(t.from);
  var to = getStateById(t.to);
  if (!from || !to) return;

  var isHL = t.id === lastUsedTransId && !simDone;
  var color = isHL ? '#F59E0B' : '#4B6A9B';
  ctx2d.strokeStyle = color; ctx2d.fillStyle = color;
  ctx2d.lineWidth = isHL ? 3 : 1.5;
  ctx2d.font = '500 11px Inter, system-ui';
  ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
  var label = t.symbols.join(', ');

  if (t.from === t.to) {
    var loopX = from.x;
    var loopY = from.y - STATE_RADIUS - 32;
    var loopRx = 28;
    var loopRy = 38;

    ctx2d.beginPath();
    ctx2d.ellipse(loopX, loopY, loopRx, loopRy, 0, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx2d.stroke();

    var ea = 0.75 * Math.PI;
    var tipX = loopX + loopRx * Math.cos(ea);
    var tipY = loopY + loopRy * Math.sin(ea);
    var prevX = loopX + loopRx * Math.cos(ea - 0.12);
    var prevY = loopY + loopRy * Math.sin(ea - 0.12);
    drawArrowHead(prevX, prevY, tipX, tipY, color, 9);

    var labelX = loopX;
    var labelY = loopY - loopRy - 6;
    var tw = ctx2d.measureText(label).width + 10;
    ctx2d.fillStyle = '#0F1117';
    ctx2d.fillRect(labelX - tw / 2, labelY - 8, tw, 16);
    ctx2d.fillStyle = isHL ? '#FCD34D' : '#94A3B8';
    ctx2d.font = '600 12px Inter, system-ui';
    ctx2d.fillText(label, labelX, labelY);
    return;
  }

  var hasReverse = false;
  for (var i = 0; i < transitions.length; i++) {
    if (transitions[i].from === t.to && transitions[i].to === t.from) { hasReverse = true; break; }
  }

  if (hasReverse) {
    var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var cpx = mx + (-dy / len) * 30, cpy = my + (dx / len) * 30;

    var af = Math.atan2(cpy - from.y, cpx - from.x);
    var at2 = Math.atan2(cpy - to.y, cpx - to.x);
    var sx = from.x + STATE_RADIUS * Math.cos(af), sy = from.y + STATE_RADIUS * Math.sin(af);
    var ex = to.x + STATE_RADIUS * Math.cos(at2), ey = to.y + STATE_RADIUS * Math.sin(at2);

    ctx2d.beginPath(); ctx2d.moveTo(sx, sy); ctx2d.quadraticCurveTo(cpx, cpy, ex, ey); ctx2d.stroke();
    var tt = 0.95;
    var tax = 2 * (1 - tt) * (cpx - sx) + 2 * tt * (ex - cpx);
    var tay = 2 * (1 - tt) * (cpy - sy) + 2 * tt * (ey - cpy);
    drawArrowHead(ex - tax * 0.1, ey - tay * 0.1, ex, ey, color, 8);
    ctx2d.fillStyle = isHL ? '#FCD34D' : '#94A3B8';
    ctx2d.fillText(label, cpx, cpy - 10);
  } else {
    var dx2 = to.x - from.x, dy2 = to.y - from.y;
    var len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    var ux = dx2 / len2, uy = dy2 / len2;
    var sx2 = from.x + STATE_RADIUS * ux, sy2 = from.y + STATE_RADIUS * uy;
    var ex2 = to.x - STATE_RADIUS * ux, ey2 = to.y - STATE_RADIUS * uy;

    ctx2d.beginPath(); ctx2d.moveTo(sx2, sy2); ctx2d.lineTo(ex2, ey2); ctx2d.stroke();
    drawArrowHead(sx2, sy2, ex2, ey2, color, 8);

    var lx = (sx2 + ex2) / 2 - uy * 14, ly = (sy2 + ey2) / 2 + ux * 14;
    var tw = ctx2d.measureText(label).width + 10;
    ctx2d.fillStyle = '#0F1117';
    ctx2d.fillRect(lx - tw / 2, ly - 10, tw, 20);
    ctx2d.fillStyle = isHL ? '#FCD34D' : '#94A3B8';
    ctx2d.fillText(label, lx, ly);
  }
}

function drawArrowHead(x1, y1, x2, y2, color, size) {
  var angle = Math.atan2(y2 - y1, x2 - x1);
  ctx2d.fillStyle = color; ctx2d.beginPath(); ctx2d.moveTo(x2, y2);
  ctx2d.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7));
  ctx2d.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7));
  ctx2d.closePath(); ctx2d.fill();
}

function animLoop() {
  if (suggestedPos || (showDeadStates && deadStates.size > 0)) draw();
  requestAnimationFrame(animLoop);
}

function computeDeadStates() {
  deadStates = new Set();
  if (states.length === 0) return;

  var acceptIds = new Set();
  for (var i = 0; i < states.length; i++) {
    if (states[i].accept) acceptIds.add(states[i].id);
  }

  if (acceptIds.size === 0) {
    for (var j = 0; j < states.length; j++) {
      deadStates.add(states[j].id);
    }
    return;
  }

  var canReach = new Set(acceptIds);
  var changed = true;
  while (changed) {
    changed = false;
    for (var ti = 0; ti < transitions.length; ti++) {
      var t = transitions[ti];
      if (canReach.has(t.from)) continue;
      if (canReach.has(t.to)) {
        canReach.add(t.from);
        changed = true;
      }
    }
  }

  for (var k = 0; k < states.length; k++) {
    if (!canReach.has(states[k].id)) {
      deadStates.add(states[k].id);
    }
  }
}

function createTrapState() {
  if (trapState) return;

  var alphabet = getAlphabet();
  if (alphabet.length === 0) {
    showToast('No transitions yet — add transitions first to determine the alphabet.', 'warn');
    showTrapState = false;
    btnToggleTrap.classList.remove('active');
    return;
  }

  var cw = CW(), ch = CH();
  var tx = cw - 80, ty = ch - 80;
  while (hasOverlap(tx, ty)) {
    tx -= 80;
    if (tx < 80) { tx = cw - 80; ty -= 80; }
  }

  var ts = { id: generateId(), name: '∅', x: tx, y: ty, accept: false, isTrap: true };
  states.push(ts);
  trapState = ts.id;

  for (var ai = 0; ai < alphabet.length; ai++) {
    transitions.push({ id: generateId(), from: ts.id, to: ts.id, symbols: [alphabet[ai]] });
  }

  for (var si = 0; si < states.length; si++) {
    var s = states[si];
    if (s.isTrap) continue;
    for (var aj = 0; aj < alphabet.length; aj++) {
      var sym = alphabet[aj];
      var hasTrans = false;
      for (var ti = 0; ti < transitions.length; ti++) {
        if (transitions[ti].from === s.id && transitions[ti].symbols.indexOf(sym) !== -1) {
          hasTrans = true;
          break;
        }
      }
      if (!hasTrans) {
        var existingTrap = null;
        for (var ei = 0; ei < transitions.length; ei++) {
          if (transitions[ei].from === s.id && transitions[ei].to === trapState) {
            existingTrap = transitions[ei];
            break;
          }
        }
        if (existingTrap) {
          if (existingTrap.symbols.indexOf(sym) === -1) existingTrap.symbols.push(sym);
        } else {
          transitions.push({ id: generateId(), from: s.id, to: trapState, symbols: [sym] });
        }
      }
    }
  }
}

function removeTrapState() {
  if (!trapState) return;
  transitions = transitions.filter(function(t) { return t.from !== trapState && t.to !== trapState; });
  states = states.filter(function(s) { return s.id !== trapState; });
  trapState = null;
}

function getAlphabet() {
  var alpha = {};
  for (var i = 0; i < transitions.length; i++) {
    for (var j = 0; j < transitions[i].symbols.length; j++) {
      var sym = transitions[i].symbols[j];
      if (!isEpsilon(sym)) alpha[sym] = true;
    }
  }
  return Object.keys(alpha).sort();
}

var STORAGE_KEY = 'automataLab_save';

function autoSave() {
  try {
    var data = {
      states: states,
      transitions: transitions,
      startState: startState,
      nextId: nextId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { }
}

function autoLoad() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var data = JSON.parse(raw);
    if (data.states && data.states.length > 0) {
      states = data.states;
      transitions = data.transitions || [];
      startState = data.startState || null;
      nextId = data.nextId || (states.length + transitions.length + 1);
      showToast('Previous session restored!', 'success');
    }
  } catch (e) { }
}

function exportJSON() {
  if (states.length === 0) { showToast('Nothing to export!', 'warn'); return; }
  var data = {
    automataLab: true,
    states: states,
    transitions: transitions,
    startState: startState,
    nextId: nextId
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'automaton.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Automaton exported!', 'success');
}

function importJSON(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if (!data.states || !Array.isArray(data.states)) {
        showToast('Invalid file format!', 'warn');
        return;
      }
      states = data.states;
      transitions = data.transitions || [];
      startState = data.startState || null;
      nextId = data.nextId || (states.length + transitions.length + 1);
      suggestedPos = null;
      simReset();
      computeDeadStates(); renderStateList(); renderTransList(); detectMode(); updateGuide(); draw();
      autoSave();
      showToast('Automaton imported! (' + states.length + ' states)', 'success');
    } catch (err) {
      showToast('Failed to parse file!', 'warn');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
