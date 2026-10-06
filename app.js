'use strict';

/* =========================================================
   Storage
   ========================================================= */
const STORE_KEY = 'goalie.v1';

// 5 color families × 5 shades, light → dark. Shown as a 5×5 grid in the goal form.
const PALETTE = [
  { name: 'Sky', shades: ['#a9d6f5', '#6ec1f0', '#4aa8e2', '#2b7fc4', '#1d4e89'] },
  { name: 'Mint', shades: ['#b5e8c9', '#7ed6a5', '#3fbf7f', '#1c7f4f', '#11573a'] },
  { name: 'Sunset', shades: ['#ffe38a', '#ffc94d', '#ffa62b', '#f07f1a', '#c85a12'] },
  { name: 'Rose', shades: ['#ffb3c1', '#ff7a93', '#f2506e', '#d63150', '#9e1f3a'] },
  { name: 'Grape', shades: ['#d9c2f5', '#b794ec', '#9466db', '#7445bd', '#4e2c8a'] },
];
const COLORS = PALETTE.flatMap(p => p.shades);
const DEFAULT_COLOR = '#4aa8e2';

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
const NAVY_L = luminance('#1c2a4a');

// Card text is navy or white, whichever has more contrast against the card's color.
function inkClass(hex) {
  if (!/^#?[0-9a-f]{6}$/i.test(hex || '')) return '';
  const L = luminance(hex);
  const navyContrast = (L + 0.05) / (NAVY_L + 0.05);
  const whiteContrast = 1.05 / (L + 0.05);
  return navyContrast >= whiteContrast ? 'on-light' : 'on-dark';
}

const SUGGESTIONS = [
  'Smoking', 'Vaping', 'Phone use', 'Water', 'Coffee', 'Workout', 'Reading', 'Meditate', 'Push-ups', 'Steps', 'Walk',
  'Journal', 'Vitamins', 'Stretch', 'Sleep', 'Screen-free hour', 'Practice', 'No sugar', 'Floss',
];

const DEFAULT_STATE = () => ({
  tallies: [],
  entries: [],
  trash: [], // recently deleted goals: { id, tally, entries, index, deletedAt }
  settings: { layout: 'grid', weekStart: 0, reminderFired: {} },
});

const TRASH_DAYS = 30;

let state = load();

// One-time: cards used to default to showing "last time"; show the measurement instead.
if (!state.settings.unitLabelMigrated) {
  state.tallies.forEach(t => { if (t.bottomMode === 'last') t.bottomMode = 'unit'; });
  state.settings.unitLabelMigrated = true;
  save();
}

// Permanently drop goals that have been in Recently Deleted too long.
{
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  const kept = state.trash.filter(item => item.deletedAt >= cutoff);
  if (kept.length !== state.trash.length) { state.trash = kept; save(); }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_STATE();
    const data = JSON.parse(raw);
    const base = DEFAULT_STATE();
    return {
      tallies: Array.isArray(data.tallies) ? data.tallies : [],
      entries: Array.isArray(data.entries) ? data.entries : [],
      trash: Array.isArray(data.trash) ? data.trash : [],
      settings: { ...base.settings, ...(data.settings || {}) },
    };
  } catch (e) {
    return DEFAULT_STATE();
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Could not save — storage full or blocked');
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* =========================================================
   Date helpers
   ========================================================= */
const DAY_MS = 86400000;
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) {
  const x = startOfDay(d);
  const diff = (x.getDay() - state.settings.weekStart + 7) % 7;
  return addDays(x, -diff);
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function dayKey(d) { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; }

function periodStart(reset, now = new Date()) {
  switch (reset) {
    case 'minute': { const m = new Date(now); m.setSeconds(0, 0); return m; }
    case 'hour': { const h = new Date(now); h.setMinutes(0, 0, 0); return h; }
    case 'day': return startOfDay(now);
    case 'week': return startOfWeek(now);
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    default: return new Date(0);
  }
}

const PERIOD_LABEL = { minute: 'THIS MINUTE', hour: 'THIS HOUR', day: 'TODAY', week: 'THIS WEEK', month: 'THIS MONTH', year: 'THIS YEAR', never: 'ALL TIME' };

function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  const today = startOfDay(new Date()).getTime();
  if (ts >= today) return `${Math.floor(diff / 3600000)}h ago`;
  if (ts >= today - DAY_MS) return 'Yesterday';
  const days = Math.ceil((today - ts) / DAY_MS);
  if (days < 7) return `${days}d ago`;
  const d = new Date(ts);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

/* =========================================================
   Tally queries
   ========================================================= */
function entriesFor(id) { return state.entries.filter(e => e.tallyId === id); }

function currentCount(t) {
  const from = periodStart(t.reset).getTime();
  return entriesFor(t.id).reduce((s, e) => (e.ts >= from ? s + e.value : s), 0);
}

function lastEntry(id) {
  let last = null;
  for (const e of state.entries) if (e.tallyId === id && (!last || e.ts > last.ts)) last = e;
  return last;
}

function hasActivityToday(id) {
  const from = startOfDay(new Date()).getTime();
  return state.entries.some(e => e.tallyId === id && e.ts >= from);
}

function logEntry(t, value) {
  const entry = { id: uid(), tallyId: t.id, ts: Date.now(), value: Number(value) };
  state.entries.push(entry);
  save();
  renderToday(t.id);
  toast(`${t.name} ${value >= 0 ? '+' : ''}${fmt(value)}`, () => {
    state.entries = state.entries.filter(e => e.id !== entry.id);
    save();
    renderToday();
  });
}

/* =========================================================
   DOM helpers
   ========================================================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

/* =========================================================
   Screens
   ========================================================= */
function openScreen(id) { $(`#screen-${id}`).classList.add('active'); }
function closeScreen(id) { $(`#screen-${id}`).classList.remove('active'); }

$$('[data-close]').forEach(btn => btn.addEventListener('click', () => {
  btn.closest('.screen').classList.remove('active');
}));

/* =========================================================
   Today screen
   ========================================================= */
let editMode = false;
let dragActive = false; // a card is being dragged; hold off re-rendering until it's dropped

function setEditMode(on) {
  editMode = on && state.tallies.length > 0;
  const btn = $('#btn-edit');
  btn.classList.toggle('on', editMode);
  btn.setAttribute('aria-pressed', String(editMode));
  btn.setAttribute('aria-label', editMode ? 'Done editing' : 'Edit goals');
  renderToday();
}

function renderToday(bumpId) {
  if (dragActive) return; // the drop re-renders
  document.querySelectorAll('.drag-ghost').forEach(g => g.remove());
  const list = $('#tally-list');
  if (editMode && !state.tallies.length) editMode = false;
  list.classList.toggle('list', state.settings.layout === 'list');
  list.classList.toggle('editing', editMode);
  $('#btn-edit').classList.toggle('on', editMode);
  list.innerHTML = '';

  const filter = state.settings.filter || 'all';
  $$('#goal-filter button').forEach(b => {
    const on = b.dataset.v === filter;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });

  if (!state.tallies.length) {
    list.append(el('div', { class: 'empty' },
      el('strong', {}, 'No goals yet'),
      'Tap + below to set your first goal.'));
    return;
  }

  // Group chips: All · each group · No group
  const groupNames = [...new Set(state.tallies.map(t => t.group).filter(Boolean))];
  let groupFilter = state.settings.groupFilter || '';
  if (groupFilter && groupFilter !== NO_GROUP && !groupNames.includes(groupFilter)) groupFilter = state.settings.groupFilter = '';
  renderGroupChips(groupNames, groupFilter);

  const visible = state.tallies.filter(t => matchesFilter(t, filter) && matchesGroup(t, groupFilter));
  if (!visible.length) {
    const where = groupFilter === NO_GROUP ? ' without a group' : groupFilter ? ` in ${groupFilter}` : '';
    list.append(el('div', { class: 'empty' },
      el('strong', {}, filter === 'all' ? `No goals${where}` : `No ${FILTER_NAMES[filter]} goals${where}`),
      filter === 'all' ? 'Add one with + or pick a different group.' : `Goals that reset every ${filter} show up here.`));
    return;
  }

  // Groups in order of first appearance; goals without a group come last.
  const groups = new Map();
  for (const t of visible) {
    const g = t.group || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  if (groups.has('')) { const none = groups.get(''); groups.delete(''); groups.set('', none); }

  // Section headings when there are groups and the chips aren't already narrowing to one
  // (always in edit mode, so a group's delete button is reachable).
  const showHeadings = groupNames.length > 0 && (!groupFilter || editMode);
  const collapsed = new Set(state.settings.collapsedGroups || []);
  for (const [name, tallies] of groups) {
    const key = name || NO_GROUP;
    const isCollapsed = showHeadings && collapsed.has(key);
    if (showHeadings) {
      list.append(el('div', { class: `group-title${isCollapsed ? ' collapsed' : ''}` },
        editMode && name ? el('button', {
          type: 'button',
          class: 'group-delete',
          'aria-label': `Remove group ${name}`,
          onclick: () => deleteGroup(name),
        }, '×') : null,
        el('button', {
          type: 'button',
          class: 'group-toggle',
          'aria-expanded': String(!isCollapsed),
          onclick: () => toggleGroup(key),
        },
        el('span', { class: 'group-name' }, name ? name.toUpperCase() : 'NO GROUP'),
        el('span', { class: 'group-count' }, String(tallies.length)),
        el('span', { class: 'group-chev', 'aria-hidden': 'true' }, '›'))));
    }
    const grid = el('div', { class: `grid${isCollapsed ? ' collapsed' : ''}`, 'data-group': name });
    tallies.forEach(t => grid.append(tallyCard(t, t.id === bumpId)));
    list.append(grid);
  }
}

const NO_GROUP = '__none__';

function matchesGroup(t, groupFilter) {
  if (!groupFilter) return true;
  if (groupFilter === NO_GROUP) return !t.group;
  return t.group === groupFilter;
}

function renderGroupChips(groupNames, active) {
  const box = $('#group-chips');
  box.classList.toggle('hidden', groupNames.length === 0);
  box.innerHTML = '';
  if (!groupNames.length) return;
  const count = g => state.tallies.filter(t => matchesGroup(t, g)).length;
  const chip = (value, label) => el('button', {
    type: 'button',
    role: 'tab',
    class: `group-chip${value === active ? ' on' : ''}`,
    'aria-selected': String(value === active),
    onclick: () => { state.settings.groupFilter = value; save(); $('#tally-list').scrollTop = 0; renderToday(); },
  }, label, el('span', { class: 'chip-count' }, String(count(value))));
  box.append(chip('', 'All'));
  groupNames.forEach(g => box.append(chip(g, g)));
  if (state.tallies.some(t => !t.group)) box.append(chip(NO_GROUP, 'No group'));
  box.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Removes the group name only: its goals stay and move to "No group".
function deleteGroup(name) {
  const members = state.tallies.filter(t => t.group === name);
  const wasFilter = state.settings.groupFilter === name;
  const wasCollapsed = (state.settings.collapsedGroups || []).includes(name);
  members.forEach(t => { t.group = ''; });
  if (wasFilter) state.settings.groupFilter = '';
  state.settings.collapsedGroups = (state.settings.collapsedGroups || []).filter(g => g !== name);
  save();
  renderToday();
  toast(`Removed group ${name}`, () => {
    members.forEach(t => { t.group = name; });
    if (wasFilter) state.settings.groupFilter = name;
    if (wasCollapsed) state.settings.collapsedGroups = [...(state.settings.collapsedGroups || []), name];
    save();
    renderToday();
  });
}

function toggleGroup(key) {
  const set = new Set(state.settings.collapsedGroups || []);
  if (set.has(key)) set.delete(key); else set.add(key);
  state.settings.collapsedGroups = [...set];
  save();
  renderToday();
}

function tallyCard(t, bump) {
  const count = currentCount(t);
  const countText = t.target ? `${fmt(count)}/${fmt(t.target)}` : fmt(count);
  const sizeClass = countText.length > 7 ? 'tiny' : countText.length > 5 ? 'small' : '';
  const tracksToday = !t.days || t.days.includes(new Date().getDay());

  let bottom;
  if (t.bottomMode === 'custom') bottom = t.bottomText || '';
  else if (t.bottomMode === 'unit') bottom = capitalize(unitLabel(t));
  else {
    const last = lastEntry(t.id);
    bottom = last ? relTime(last.ts) : 'Not yet';
  }

  const card = el('div', {
    class: `card ${inkClass(t.color)}${tracksToday ? '' : ' off-day'}${bump ? ' bump' : ''}`,
    style: `background:${t.color}`,
    role: 'button',
    'data-id': t.id,
    'aria-label': editMode
      ? `${t.name}. Drag to reorder, tap to edit.`
      : `${t.name}: ${countText}. Tap to log, hold for options.`,
  },
  el('div', { class: 'card-top' },
    el('div', { class: 'card-name' }, t.name),
    el('div', { class: 'card-period' }, PERIOD_LABEL[t.reset] || 'TODAY', goalBadge(t, count))),
  el('div', { class: `card-count ${sizeClass}` }, countText),
  cardFoot(t, bottom),
  editMode ? deleteButton(t) : null);

  if (editMode) attachDrag(card, t);
  else attachPress(card, () => onTap(t), () => tallyMenu(t));
  return card;
}

function deleteButton(t) {
  const b = el('button', { type: 'button', class: 'card-delete', 'aria-label': `Delete ${t.name}` }, '×');
  ['pointerdown', 'pointerup', 'pointermove'].forEach(ev => b.addEventListener(ev, e => e.stopPropagation()));
  b.addEventListener('click', e => { e.stopPropagation(); deleteTally(t); });
  return b;
}

// Moves a goal (and its history) to Recently Deleted. Undo from the toast or restore from Settings.
function deleteTally(t) {
  const index = state.tallies.findIndex(x => x.id === t.id);
  if (index < 0) return;
  const item = {
    id: uid(),
    tally: t,
    entries: state.entries.filter(e => e.tallyId === t.id),
    index,
    deletedAt: Date.now(),
  };
  state.trash.unshift(item);
  state.tallies.splice(index, 1);
  state.entries = state.entries.filter(e => e.tallyId !== t.id);
  save();
  renderToday();
  renderTrash();
  toast(`Deleted ${t.name}`, () => restoreTally(item.id));
}

function restoreTally(trashId) {
  const i = state.trash.findIndex(x => x.id === trashId);
  if (i < 0) return;
  const [item] = state.trash.splice(i, 1);
  state.tallies.splice(Math.min(item.index, state.tallies.length), 0, item.tally);
  state.entries.push(...item.entries);
  save();
  renderToday();
  renderTrash();
}

// Edit mode: drag a card to reorder (or into another group); a plain tap opens its settings.
function attachDrag(card, t) {
  let start = null, dragging = false, ghost = null;
  const list = $('#tally-list');

  const begin = () => {
    const r = card.getBoundingClientRect();
    ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.append(ghost);
    card.classList.add('drag-placeholder');
    dragActive = true;
  };

  const move = e => {
    ghost.style.transform = `translate(${e.clientX - start.x}px, ${e.clientY - start.y}px) scale(1.05)`;
    const lr = list.getBoundingClientRect();
    if (e.clientY < lr.top + 50) list.scrollTop -= 10;
    else if (e.clientY > lr.bottom - 50) list.scrollTop += 10;

    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
    if (!target || target === card || !list.contains(target)) return;
    const cards = [...list.querySelectorAll('.card')];
    if (cards.indexOf(card) < cards.indexOf(target)) target.after(card);
    else target.before(card);
  };

  const finish = () => {
    ghost?.remove();
    ghost = null;
    card.classList.remove('drag-placeholder');
    dragActive = false;
    const byId = new Map(state.tallies.map(x => [x.id, x]));
    const ordered = [];
    for (const c of list.querySelectorAll('.card')) {
      const tally = byId.get(c.dataset.id);
      if (!tally) continue;
      tally.group = c.parentElement.dataset.group || '';
      ordered.push(tally);
    }
    // Goals hidden by the filter keep their slots; the visible ones fill the rest in their new order.
    const shown = new Set(ordered.map(x => x.id));
    let next = 0;
    state.tallies = state.tallies.map(x => (shown.has(x.id) ? ordered[next++] : x));
    save();
    renderToday();
  };

  card.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
    try { card.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  card.addEventListener('pointermove', e => {
    if (!start) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      dragging = true;
      begin();
    }
    move(e);
  });
  card.addEventListener('pointerup', () => {
    if (!start) return;
    if (dragging) finish();
    else openForm(t);
    start = null; dragging = false;
  });
  const cancel = () => {
    if (dragging) finish();
    start = null; dragging = false;
  };
  card.addEventListener('pointercancel', cancel);
  card.addEventListener('lostpointercapture', () => { if (dragging) cancel(); });
  card.addEventListener('contextmenu', e => e.preventDefault());
}

function goalBadge(t, count) {
  if (!t.target) return null;
  if (t.direction === 'decrease') {
    return count > t.target ? el('span', { class: 'card-check over', title: 'Over your goal' }, '!') : null;
  }
  return count >= t.target ? el('span', { class: 'card-check', title: 'Goal reached' }, '✓') : null;
}

function attachPress(node, onTapFn, onLongFn) {
  let timer = null, fired = false, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); timer = null; node.classList.remove('pressing'); };
  node.addEventListener('pointerdown', e => {
    fired = false; sx = e.clientX; sy = e.clientY;
    node.classList.add('pressing');
    timer = setTimeout(() => { fired = true; cancel(); onLongFn(); }, 480);
  });
  node.addEventListener('pointermove', e => {
    if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel();
  });
  node.addEventListener('pointerup', () => { if (timer) { cancel(); if (!fired) onTapFn(); } });
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('contextmenu', e => e.preventDefault());
}

function lastInPeriod(t) {
  const from = periodStart(t.reset).getTime();
  let last = null;
  for (const e of state.entries) {
    if (e.tallyId === t.id && e.ts >= from && (!last || e.ts > last.ts)) last = e;
  }
  return last;
}

// Take back the most recent entry in the current period.
function takeBack(t) {
  const last = lastInPeriod(t);
  if (!last) return;
  state.entries = state.entries.filter(e => e.id !== last.id);
  save();
  renderToday(t.id);
  toast(`${t.name} −${fmt(last.value)}`, () => {
    state.entries.push(last);
    save();
    renderToday();
  });
}

// Bottom row of a card: − take back, the label, + log.
function cardFoot(t, label) {
  const btn = (label, cls, action, disabled) => {
    const b = el('button', { type: 'button', class: `step-btn ${cls}`, 'aria-label': cls === 'minus' ? `Take back last ${t.name} entry` : `Log ${t.name}` }, label);
    if (disabled) b.disabled = true;
    // Keep the card's own tap / long-press from firing.
    ['pointerdown', 'pointerup', 'pointermove'].forEach(ev => b.addEventListener(ev, e => e.stopPropagation()));
    b.addEventListener('click', e => { e.stopPropagation(); action(); });
    return b;
  };
  return el('div', { class: 'card-foot' },
    btn('−', 'minus', () => takeBack(t), !lastInPeriod(t)),
    el('div', { class: 'card-bottom' }, label),
    btn('+', 'plus', () => onTap(t)));
}

function onTap(t) {
  if (t.logMode === 'custom') promptValue(t);
  else logEntry(t, t.defaultCount || 1);
}

function promptValue(t) {
  const input = el('input', {
    class: 'text-input', type: 'number', inputmode: 'decimal', step: 'any',
    placeholder: `${capitalize(unitLabel(t))} (default ${fmt(t.defaultCount || 1)})`,
  });
  const submit = () => {
    const v = input.value === '' ? (t.defaultCount || 1) : parseFloat(input.value);
    if (!isFinite(v)) return;
    closeSheet();
    logEntry(t, v);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  openSheet(
    el('h3', {}, `Log ${t.name}`),
    input,
    el('button', { class: 'sheet-btn primary', onclick: submit }, 'Log'),
    el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Cancel'),
  );
  setTimeout(() => input.focus(), 250);
}

function tallyMenu(t) {
  const from = periodStart(t.reset).getTime();
  const lastInPeriod = entriesFor(t.id).filter(e => e.ts >= from).sort((a, b) => b.ts - a.ts)[0];
  openSheet(
    el('h3', {}, t.name),
    el('button', { class: 'sheet-btn', onclick: () => { closeSheet(); setTimeout(() => promptValue(t), 300); } }, 'Log custom amount'),
    lastInPeriod ? el('button', {
      class: 'sheet-btn',
      onclick: () => {
        state.entries = state.entries.filter(e => e.id !== lastInPeriod.id);
        save(); renderToday(); closeSheet(); toast('Last entry removed');
      },
    }, `Undo last (${fmt(lastInPeriod.value)})`) : null,
    el('button', { class: 'sheet-btn', onclick: () => { closeSheet(); setTimeout(() => historySheet(t), 300); } }, 'History'),
    el('button', { class: 'sheet-btn', onclick: () => { closeSheet(); openForm(t); } }, 'Edit'),
    el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Cancel'),
  );
}

function historySheet(t) {
  const rows = entriesFor(t.id).sort((a, b) => b.ts - a.ts).slice(0, 100);
  const box = el('div', { class: 'hist' });
  const draw = () => {
    box.innerHTML = '';
    const current = entriesFor(t.id).sort((a, b) => b.ts - a.ts).slice(0, 100);
    if (!current.length) box.append(el('p', {}, 'No entries yet.'));
    for (const e of current) {
      const d = new Date(e.ts);
      const when = `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      box.append(el('div', { class: 'hist-row' },
        el('span', {}, `${when} · ${fmt(e.value)}`),
        el('button', { onclick: () => { state.entries = state.entries.filter(x => x.id !== e.id); save(); renderToday(); draw(); } }, 'Delete')));
    }
  };
  draw();
  openSheet(
    el('h3', {}, `${t.name} history`),
    el('p', {}, rows.length >= 100 ? 'Most recent 100 entries' : `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`),
    box,
    el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Done'),
  );
}

const FILTER_NAMES = { all: 'all', day: 'daily', week: 'weekly', year: 'yearly' };

function matchesFilter(t, filter) {
  return filter === 'all' || t.reset === filter;
}

$('#goal-filter').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.settings.filter = b.dataset.v;
  save();
  $('#tally-list').scrollTop = 0;
  renderToday();
});

$('#btn-edit').addEventListener('click', () => setEditMode(!editMode));

$('#btn-layout').addEventListener('click', () => {
  state.settings.layout = state.settings.layout === 'list' ? 'grid' : 'list';
  save(); renderToday();
});

$('#btn-help').addEventListener('click', () => {
  openSheet(
    el('h3', {}, 'How it works'),
    el('ol', {},
      el('li', {}, 'Tap + to set a goal: anything you want to do more of or cut back on.'),
      el('li', {}, 'Tap a goal card (or its +) to check in. Use − to take one back. Hold a card for history and more.'),
      el('li', {}, 'Tap the chart icon to see weekly, monthly and yearly totals, plus what time of day you log.')),
    el('h3', {}, 'Install on iPhone'),
    el('ol', {},
      el('li', {}, 'Open this page in Safari.'),
      el('li', {}, 'Tap Share, then “Add to Home Screen”.'),
      el('li', {}, 'Launch it from the home screen icon — it runs full-screen and works offline.')),
    el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Got it'),
  );
});

$('#btn-add').addEventListener('click', () => { editMode = false; openForm(null); });
$('#btn-stats').addEventListener('click', () => {
  if (editMode) setEditMode(false); statsState.offset = 0; renderStats(); openScreen('stats'); });
$('#btn-settings').addEventListener('click', () => {
  if (editMode) setEditMode(false); renderSettings(); openScreen('settings'); });

/* =========================================================
   Create / Edit form
   ========================================================= */
let form = null;
let editingId = null;
let autoCustom = false; // logMode was switched by picking a time unit, not by the user

function blankForm() {
  return {
    name: '', examples: '', nonExamples: '', direction: 'increase', unit: 'occurrences', customUnit: '', reset: 'day', days: [0, 1, 2, 3, 4, 5, 6], group: '', defaultCount: 1,
    logMode: 'default', target: null, reminder: null,
    color: DEFAULT_COLOR, bottomMode: 'unit', bottomText: '',
  };
}

function openForm(t) {
  editingId = t ? t.id : null;
  autoCustom = false;
  form = t ? { ...blankForm(), ...JSON.parse(JSON.stringify(t)) } : blankForm();
  // Days / weeks / months / years are no longer unit choices; keep the same word as a custom unit.
  if (['days', 'weeks', 'months', 'years'].includes(form.unit)) {
    form.customUnit = form.unit;
    form.unit = 'custom';
  }
  $('#create-title').textContent = t ? 'EDIT' : 'CREATE';
  $('#btn-submit').textContent = t ? 'SAVE' : 'ADD';
  $('#btn-delete').classList.toggle('hidden', !t);
  $('#idea-chips').classList.add('hidden');
  $('#f-name').value = form.name;
  $('#f-default').value = form.defaultCount;
  $('#f-goal').value = form.target ?? '';
  $('#f-examples').value = form.examples || '';
  $('#f-nonexamples').value = form.nonExamples || '';
  $('#f-bottom').value = form.bottomText;
  $('#f-unit').value = form.customUnit || '';
  $('#create-form').scrollTop = 0;
  syncForm();
  openScreen('create');
}

function syncForm() {
  setSeg('logMode', form.logMode);
  setSeg('direction', form.direction);
  setSeg('unit', form.unit);
  setSeg('bottomMode', form.bottomMode);
  $$('[data-field="days"] button').forEach(b => b.classList.toggle('on', form.days.includes(+b.dataset.v)));
  $('#goal-per').textContent = PER_PHRASE[form.reset].trim().toUpperCase();
  renderGoalDesc();
  $('#f-bottom').classList.toggle('hidden', form.bottomMode !== 'custom');
  $('#f-unit').classList.toggle('hidden', form.unit !== 'custom');
  setSeg('per', form.reset);
  $('#bottom-unit-btn').textContent = unitLabel(form).toUpperCase() || 'MEASUREMENT';
  $('#group-value').textContent = form.group ? form.group.toUpperCase() : 'NONE';
  $('#reminder-value').textContent = form.reminder ? `DAILY AT ${fmtTime(form.reminder)}` : 'NONE';
  $$('#color-grid .swatch').forEach(s => s.classList.toggle('on', s.dataset.c === form.color));
  validateForm();
}

function setSeg(field, value) {
  $$(`[data-field="${field}"] button`).forEach(b => b.classList.toggle('on', b.dataset.v === value));
}

function validateForm() {
  const ok = form.name.trim().length > 0 && form.days.length > 0 &&
    isFinite(form.defaultCount) && form.defaultCount !== 0 &&
    (form.target == null || form.target > 0) &&
    (form.unit !== 'custom' || (form.customUnit || '').trim().length > 0);
  $('#btn-submit').disabled = !ok;
}

const PER_PHRASE = { minute: ' per minute', hour: ' per hour', day: ' per day', week: ' per week', month: ' per month', year: ' per year', never: ' in total' };
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// The unit as the user sees it: a built-in unit or their own custom word.
function unitLabel(t) {
  if (t.unit === 'custom') return (t.customUnit || '').trim();
  return t.unit || 'occurrences';
}

function singular(word) {
  if (/(ss|sh|ch|x|z)es$/i.test(word)) return word.slice(0, -2);
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return word;
}

function unitWord(t, n) {
  const label = unitLabel(t);
  return n === 1 ? singular(label) : label;
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function daysPhrase(days) {
  const set = [...days].sort().join('');
  if (set === '0123456') return '';
  if (set === '12345') return 'weekdays';
  if (set === '06') return 'weekends';
  return joinList(days.slice().sort().map(d => DAY_PLURAL[d]));
}

function goalDescription(f) {
  const name = (f.name || '').trim().toLowerCase();
  if (!name) return null;
  let text = `Your goal is to ${f.direction} ${name}`;
  if (f.target > 0) text += ` to ${fmt(f.target)} ${unitWord(f, f.target)}${PER_PHRASE[f.reset]}`;
  const days = daysPhrase(f.days);
  if (days) text += (f.reset === 'day' || f.reset === 'hour' || f.reset === 'minute') ? ` on ${days}` : `, tracked on ${days}`;
  return text + '.';
}

function renderGoalDesc() {
  const p = $('#goal-desc');
  const text = goalDescription(form);
  p.textContent = text || 'Enter what you want to measure to see your goal.';
  p.classList.toggle('empty-desc', !text);
}

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toUpperCase();
}

// Color swatches
PALETTE.forEach(({ name, shades }) => shades.forEach((c, i) => {
  $('#color-grid').append(el('button', {
    type: 'button', class: 'swatch', style: `background:${c}`, 'data-c': c, 'aria-label': `${name} ${i + 1}`, title: `${name} ${i + 1}`,
    onclick: () => { form.color = c; syncForm(); },
  }));
}));

// Segmented controls
$$('#create-form .seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const v = b.dataset.v;
  switch (seg.dataset.field) {
    case 'per': form.reset = v; break; // the PER choice is also when the goal's count resets
    case 'logMode': form.logMode = v; autoCustom = false; break;
    case 'bottomMode': form.bottomMode = v; break;
    case 'direction': form.direction = v; break;
    case 'unit':
      form.unit = v;
      if (v === 'custom') setTimeout(() => $('#f-unit').focus(), 50);
      // Time-based goals are usually logged as an amount, not a fixed +1.
      if ((v === 'minutes' || v === 'hours') && form.logMode === 'default' && form.defaultCount === 1) {
        form.logMode = 'custom';
        autoCustom = true;
      } else if (v !== 'minutes' && v !== 'hours' && autoCustom) {
        form.logMode = 'default';
        autoCustom = false;
      }
      break;
  }
  syncForm();
}));

$('[data-field="days"]').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = +b.dataset.v;
  form.days = form.days.includes(d) ? form.days.filter(x => x !== d) : [...form.days, d].sort();
  syncForm();
});

$('#f-name').addEventListener('input', e => { form.name = e.target.value; validateForm(); renderGoalDesc(); });
$('#f-default').addEventListener('input', e => { form.defaultCount = parseFloat(e.target.value); validateForm(); });
$('#f-goal').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  form.target = isFinite(v) ? v : null;
  validateForm(); renderGoalDesc();
});
$('#f-examples').addEventListener('input', e => { form.examples = e.target.value; });
$('#f-nonexamples').addEventListener('input', e => { form.nonExamples = e.target.value; });
$('#f-bottom').addEventListener('input', e => { form.bottomText = e.target.value; });
$('#f-unit').addEventListener('input', e => {
  form.customUnit = e.target.value;
  validateForm(); renderGoalDesc();
  $('#bottom-unit-btn').textContent = unitLabel(form).toUpperCase() || 'MEASUREMENT';
});

$('#btn-idea').addEventListener('click', () => {
  const box = $('#idea-chips');
  if (!box.childElementCount) {
    SUGGESTIONS.forEach(s => box.append(el('button', {
      type: 'button', class: 'chip',
      onclick: () => { form.name = s; $('#f-name').value = s; box.classList.add('hidden'); validateForm(); renderGoalDesc(); },
    }, s)));
  }
  box.classList.toggle('hidden');
});

$('#btn-group').addEventListener('click', () => {
  const groups = [...new Set(state.tallies.map(t => t.group).filter(Boolean))];
  const input = el('input', { class: 'text-input', type: 'text', maxlength: 24, placeholder: 'New group name' });
  const pick = g => { form.group = g; syncForm(); closeSheet(); };
  openSheet(
    el('h3', {}, 'Group'),
    el('button', { class: `sheet-btn${!form.group ? ' selected' : ''}`, onclick: () => pick('') }, 'None'),
    groups.map(g => el('button', { class: `sheet-btn${form.group === g ? ' selected' : ''}`, onclick: () => pick(g) }, g)),
    input,
    el('button', { class: 'sheet-btn primary', onclick: () => { if (input.value.trim()) pick(input.value.trim()); } }, 'Add group'),
  );
});

$('#btn-reminder').addEventListener('click', () => {
  const input = el('input', { class: 'text-input', type: 'time', value: form.reminder || '09:00' });
  openSheet(
    el('h3', {}, 'Daily reminder'),
    el('p', {}, 'You’ll get a banner at this time. iPhone only lets web apps send it while Goalie is open or was used recently. For a guaranteed alert, also set an iPhone Reminder.'),
    input,
    el('button', {
      class: 'sheet-btn primary',
      onclick: () => { form.reminder = input.value || null; syncForm(); closeSheet(); ensureNotifyPermission(); },
    }, 'Save reminder'),
    el('button', { class: 'sheet-btn', onclick: () => { form.reminder = null; syncForm(); closeSheet(); } }, 'No reminder'),
  );
});

$('#create-form').addEventListener('submit', e => e.preventDefault());

$('#btn-submit').addEventListener('click', () => {
  validateForm();
  if ($('#btn-submit').disabled) return;
  const data = {
    ...form,
    name: form.name.trim(),
    bottomText: (form.bottomText || '').trim(),
    group: (form.group || '').trim(),
    examples: (form.examples || '').trim(),
    nonExamples: (form.nonExamples || '').trim(),
  };
  if (editingId) {
    const i = state.tallies.findIndex(t => t.id === editingId);
    if (i >= 0) state.tallies[i] = { ...state.tallies[i], ...data, id: editingId };
  } else {
    state.tallies.push({ ...data, id: uid(), createdAt: Date.now() });
    if (!matchesFilter(data, state.settings.filter || 'all')) state.settings.filter = 'all';
    if (!matchesGroup(data, state.settings.groupFilter || '')) state.settings.groupFilter = '';
  }
  save();
  renderToday();
  closeScreen('create');
});

$('#btn-delete').addEventListener('click', () => {
  const t = state.tallies.find(x => x.id === editingId);
  if (t) { deleteTally(t); closeScreen('create'); }
});

/* =========================================================
   Statistics
   ========================================================= */
const statsState = { range: 'week', offset: 0, view: 'bars' };

function statsRange() {
  const now = new Date();
  const { range, offset } = statsState;
  if (range === 'week') {
    const start = addDays(startOfWeek(now), offset * 7);
    return { start, end: addDays(start, 7), buckets: 7 };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end, buckets: daysInMonth(start.getFullYear(), start.getMonth()) };
  }
  const start = new Date(now.getFullYear() + offset, 0, 1);
  return { start, end: new Date(start.getFullYear() + 1, 0, 1), buckets: 12 };
}

function rangeLabel({ start, end }) {
  const { range } = statsState;
  if (range === 'month') return `${MONTH_LONG[start.getMonth()]} ${start.getFullYear()}`;
  if (range === 'year') return String(start.getFullYear());
  const last = addDays(end, -1);
  const a = `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`;
  const b = `${MONTH_SHORT[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  return start.getFullYear() === last.getFullYear() ? `${a} - ${b}` : `${a}, ${start.getFullYear()} - ${b}`;
}

function bucketIndex(ts, start) {
  const d = new Date(ts);
  if (statsState.range === 'year') return d.getMonth();
  return Math.round((startOfDay(d) - startOfDay(start)) / DAY_MS);
}

function bucketLabels(r) {
  if (statsState.range === 'week') {
    return Array.from({ length: 7 }, (_, i) => DAY_SHORT[(state.settings.weekStart + i) % 7]);
  }
  if (statsState.range === 'month') {
    return Array.from({ length: r.buckets }, (_, i) => ((i % 7) === 0 ? String(i + 1) : ''));
  }
  return 'JFMAMJJASOND'.split('');
}

function niceMax(v) {
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function renderStats() {
  const name = (state.settings.name || '').trim();
  $('#stats-title').textContent = name ? `Here are your STATS, ${name}!` : 'Here are your STATS!';
  const r = statsRange();
  $('#range-label').textContent = rangeLabel(r);
  $('#range-next').disabled = statsState.offset >= 0;
  $$('#range-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === statsState.range));
  $$('.view-btn').forEach(b => b.classList.toggle('on', b.dataset.view === statsState.view));

  const list = $('#stats-list');
  list.innerHTML = '';
  if (!state.tallies.length) {
    list.append(el('div', { class: 'empty' }, el('strong', {}, 'No data yet'), 'Set a goal to see your stats.'));
    return;
  }

  const startMs = r.start.getTime(), endMs = r.end.getTime();
  const currentIdx = Date.now() >= startMs && Date.now() < endMs ? bucketIndex(Date.now(), r.start) : -1;
  const periodWord = statsState.range.toUpperCase();

  for (const t of state.tallies) {
    const entries = entriesFor(t.id).filter(e => e.ts >= startMs && e.ts < endMs);
    const sums = new Array(r.buckets).fill(0);
    const activeDays = new Set();
    let total = 0;
    for (const e of entries) {
      sums[bucketIndex(e.ts, r.start)] += e.value;
      activeDays.add(dayKey(e.ts));
      total += e.value;
    }
    const avg = activeDays.size ? total / activeDays.size : 0;

    const card = el('div', { class: `stat-card ${inkClass(t.color)}`, style: `background:${t.color}` },
      el('h3', {}, t.name),
      el('div', { class: 'stat-sub' }, `${fmt(total)} ${unitWord(t, total).toUpperCase()} · ${fmt(avg)} PER ACTIVE DAY`));

    card.append(statsState.view === 'bars'
      ? barChart(sums, bucketLabels(r), currentIdx)
      : lineChart(t, sums, bucketLabels(r), currentIdx));
    list.append(card);
  }
}

function barChart(sums, labels, currentIdx) {
  const max = niceMax(Math.max(0, ...sums));
  const yAxis = el('div', { class: 'y-axis', style: 'height:170px' },
    el('span', { style: 'top:0' }, fmt(max)),
    el('span', { style: 'top:50%' }, fmt(max / 2)));
  const bars = el('div', { class: 'bars' },
    sums.map((v, i) => el('div', { class: `bar-col${i === currentIdx ? ' current' : ''}` },
      el('div', { class: 'bar-track' },
        el('div', { class: 'bar-fill', style: `height:${Math.max(0, Math.min(100, (v / max) * 100))}%` })))));
  const xl = el('div', { class: 'x-labels' }, labels.map(l => el('span', { style: 'display:flex;justify-content:center' }, l)));
  return el('div', { class: 'chart' }, yAxis, el('div', { class: 'plot' }, bars, xl));
}

// Line chart: y = amount in the goal's own unit, one point per day (or per month in Year view).
function lineChart(t, sums, labels, currentIdx) {
  const n = sums.length;
  const span = n - 1;
  // Don't draw into the future: stop at today in the current period.
  const last = currentIdx >= 0 ? currentIdx : n - 1;

  // Dashed goal line only when the goal's period matches the chart's steps.
  const { range } = statsState;
  const goalFits = t.target > 0 && ((t.reset === 'day' && range !== 'year') || (t.reset === 'month' && range === 'year'));
  const max = niceMax(Math.max(0, ...sums, goalFits ? t.target : 0));
  const yOf = v => 100 - (v / max) * 100;
  const xOf = i => (span ? (i / span) * 100 : 50);

  const colw = range === 'month' ? (7 / span) * 100 : 100 / span;
  const plot = el('div', { class: 'scatter', style: `--colw:${colw}%` });
  const points = sums.slice(0, last + 1).map((v, i) => ({ x: xOf(i), y: yOf(v), v, i }));

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'scatter-line');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  if (goalFits) {
    const goal = document.createElementNS(NS, 'line');
    goal.setAttribute('class', 'goal-line');
    goal.setAttribute('x1', '0'); goal.setAttribute('x2', '100');
    goal.setAttribute('y1', String(yOf(t.target))); goal.setAttribute('y2', String(yOf(t.target)));
    goal.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(goal);
  }
  if (points.length > 1) {
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(line);
  }
  plot.append(svg);

  const unit = unitLabel(t);
  for (const p of points) {
    plot.append(el('div', { class: 'pt', style: `left:${p.x}%;top:${p.y}%`, title: `${labels[p.i] || ''} ${fmt(p.v)} ${unitWord(t, p.v)}`.trim() }));
  }

  const yAxis = el('div', { class: 'y-axis', style: 'height:170px;width:34px' },
    el('span', { style: 'top:0' }, fmt(max)),
    el('span', { style: 'top:50%' }, fmt(max / 2)),
    el('span', { style: 'top:100%' }, '0'));
  const xl = el('div', { style: 'position:relative;height:22px;margin-top:10px' },
    labels.map((l, i) => (l ? el('span', {
      style: `position:absolute;left:${xOf(i)}%;transform:translateX(-50%);font-size:14px;font-weight:700;color:var(--stat-soft)`,
    }, l) : null)));

  return el('div', {},
    el('div', { class: 'axis-unit' }, unit.toUpperCase(), goalFits ? el('span', { class: 'axis-goal' }, `- - goal ${fmt(t.target)}`) : null),
    el('div', { class: 'chart' }, yAxis, el('div', { class: 'plot', style: 'padding-right:10px' }, plot, xl)));
}

$('#range-tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  statsState.range = b.dataset.v; statsState.offset = 0; renderStats();
});
$('#range-prev').addEventListener('click', () => { statsState.offset--; renderStats(); });
$('#range-next').addEventListener('click', () => { if (statsState.offset < 0) { statsState.offset++; renderStats(); } });
$$('.view-btn').forEach(b => b.addEventListener('click', () => { statsState.view = b.dataset.view; renderStats(); }));

// Swipe left/right on stats to change period
(() => {
  let sx = null, sy = null;
  const list = $('#stats-list');
  list.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  list.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) statsState.offset--;
    else if (statsState.offset < 0) statsState.offset++;
    else return;
    renderStats();
  });
})();

/* =========================================================
   Settings
   ========================================================= */
function renderTrash() {
  const box = $('#trash-list');
  box.innerHTML = '';
  if (!state.trash.length) {
    box.append(el('p', { class: 'note trash-empty' }, 'Nothing here.'));
    return;
  }
  for (const item of state.trash) {
    const daysLeft = Math.max(1, Math.ceil((item.deletedAt + TRASH_DAYS * DAY_MS - Date.now()) / DAY_MS));
    const when = relTime(item.deletedAt).replace(/^(Just now|Yesterday)$/, m => m.toLowerCase());
    const n = item.entries.length;
    box.append(el('div', { class: 'trash-row' },
      el('span', { class: 'trash-dot', style: `background:${item.tally.color}` }),
      el('div', { class: 'trash-info' },
        el('div', { class: 'trash-name' }, item.tally.name),
        el('div', { class: 'trash-meta' }, `Deleted ${when} · ${n} entr${n === 1 ? 'y' : 'ies'} · ${daysLeft}d left`)),
      el('button', {
        class: 'trash-btn restore',
        onclick: () => { restoreTally(item.id); toast(`Restored ${item.tally.name}`); },
      }, 'Restore'),
      el('button', {
        class: 'trash-btn forever',
        'aria-label': `Delete ${item.tally.name} forever`,
        onclick: () => openSheet(
          el('h3', {}, `Delete “${item.tally.name}” forever?`),
          el('p', {}, 'This goal and its history will be gone for good. This can’t be undone.'),
          el('button', {
            class: 'sheet-btn danger',
            onclick: () => {
              state.trash = state.trash.filter(x => x.id !== item.id);
              save(); renderTrash(); closeSheet();
            },
          }, 'Delete forever'),
          el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Cancel'),
        ),
      }, '×')));
  }
}

function renderSettings() {
  if (document.activeElement !== $('#set-name')) $('#set-name').value = state.settings.name || '';
  renderTrash();
  $$('#set-weekstart button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.settings.weekStart));
  const status = $('#notify-status');
  if (!('Notification' in window)) {
    status.textContent = 'System banners need Goalie added to your Home Screen (iOS 16.4+). In-app banners still work.';
  } else {
    status.textContent = {
      granted: 'Banners are on.',
      denied: 'Banners are blocked. Turn them on in iPhone Settings → Notifications → Goalie. In-app banners still work.',
      default: 'Tap above to allow reminder banners.',
    }[Notification.permission] || '';
  }
}

$('#set-name').addEventListener('input', e => {
  state.settings.name = e.target.value.trim();
  save();
});
$('#set-name').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

$('#set-weekstart').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.settings.weekStart = +b.dataset.v;
  save(); renderSettings(); renderToday();
});

$('#btn-export').addEventListener('click', async () => {
  const json = JSON.stringify({ app: 'goalie', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  const name = `goalie-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Goalie backup' });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.tallies) || !Array.isArray(data.entries)) throw new Error('bad file');
    openSheet(
      el('h3', {}, 'Replace current data?'),
      el('p', {}, `This backup has ${data.tallies.length} tallies and ${data.entries.length} entries. Your current data will be replaced.`),
      el('button', {
        class: 'sheet-btn primary',
        onclick: () => {
          state = { tallies: data.tallies, entries: data.entries, trash: Array.isArray(data.trash) ? data.trash : [], settings: { ...DEFAULT_STATE().settings, ...(data.settings || {}) } };
          save(); renderToday(); renderSettings(); closeSheet(); toast('Backup imported');
        },
      }, 'Import'),
      el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Cancel'),
    );
  } catch (err) {
    toast('That file isn’t a valid backup');
  }
});

$('#btn-notify').addEventListener('click', async () => { await ensureNotifyPermission(); renderSettings(); });

$('#btn-wipe').addEventListener('click', () => {
  openSheet(
    el('h3', {}, 'Delete everything?'),
    el('p', {}, 'All tallies and history on this device will be erased. Export a backup first if you might want it back.'),
    el('button', {
      class: 'sheet-btn danger',
      onclick: () => { state = DEFAULT_STATE(); save(); renderToday(); renderSettings(); closeSheet(); toast('All data deleted'); },
    }, 'Delete all data'),
    el('button', { class: 'sheet-btn', onclick: closeSheet }, 'Cancel'),
  );
});

/* =========================================================
   Reminders (system banner + in-app banner)
   ========================================================= */
async function ensureNotifyPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
  }
  return Notification.permission === 'granted';
}

// The icon badge feature was removed; clear any badge an older version left behind.
try { navigator.clearAppBadge?.().catch(() => {}); } catch (e) { /* unsupported */ }

let bannerTimer = null;
function showBanner(t, body) {
  const b = $('#banner');
  b.innerHTML = '';
  b.style.setProperty('--banner-accent', t.color);
  b.append(
    el('div', { class: 'banner-text' }, el('strong', {}, t.name), el('span', {}, body)),
    el('button', { class: 'banner-btn', onclick: () => { hideBanner(); onTap(t); } }, 'Check in'),
    el('button', { class: 'banner-close', 'aria-label': 'Dismiss', onclick: hideBanner }, '×'),
  );
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, 8000);
}
function hideBanner() { $('#banner').classList.remove('show'); }

async function checkReminders() {
  const now = new Date();
  const todayK = dayKey(now);
  const fired = state.settings.reminderFired || (state.settings.reminderFired = {});
  for (const t of state.tallies) {
    if (!t.reminder || fired[t.id] === todayK) continue;
    if (t.days && !t.days.includes(now.getDay())) continue;
    const [h, m] = t.reminder.split(':').map(Number);
    const due = new Date(now); due.setHours(h, m, 0, 0);
    const late = now - due;
    if (late < 0 || late > 15 * 60000) continue;
    fired[t.id] = todayK;
    save();
    const body = `Time to check in. ${fmt(currentCount(t))} ${unitWord(t, currentCount(t))} so far ${(PERIOD_LABEL[t.reset] || '').toLowerCase()}.`;
    // Looking at the app: slide down an in-app banner. Otherwise: a system banner (needs permission).
    if (document.visibilityState === 'visible') {
      showBanner(t, body);
    } else if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) reg.showNotification(t.name, { body, icon: 'icons/goalie-192.png', tag: t.id });
        else new Notification(t.name, { body });
      } catch (e) { /* ignore */ }
    }
  }
}

/* =========================================================
   Sheet + toast
   ========================================================= */
function openSheet(...children) {
  const sheet = $('#sheet');
  sheet.innerHTML = '';
  sheet.append(...children.flat().filter(Boolean));
  $('#sheet-backdrop').classList.add('show');
  requestAnimationFrame(() => sheet.classList.add('show'));
}
function closeSheet() {
  $('#sheet').classList.remove('show');
  $('#sheet-backdrop').classList.remove('show');
  if (document.activeElement) document.activeElement.blur();
}
$('#sheet-backdrop').addEventListener('click', closeSheet);

let toastTimer = null;
function toast(msg, undoFn) {
  const t = $('#toast');
  t.innerHTML = '';
  t.append(el('span', {}, msg));
  if (undoFn) t.append(el('button', { onclick: () => { undoFn(); t.classList.remove('show'); } }, 'UNDO'));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undoFn ? 3500 : 2200);
}

/* =========================================================
   Boot
   ========================================================= */
renderToday();
checkReminders();
setInterval(() => { renderToday(); checkReminders(); }, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { renderToday(); checkReminders(); }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
