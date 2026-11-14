// eval-upgrade dashboard. Talks to the localhost API; mutating calls carry the
// session token from the URL (?token=...) in the X-Auth-Token header.
const TOKEN = new URLSearchParams(location.search).get('token') ?? '';
const $ = (sel) => document.querySelector(sel);
// Artifact ids, finding messages and model output come from the evaluated files and
// from LLM responses; this page holds a token that can write files, so they are
// never inserted as HTML.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let config = null;
let staged = null; // staged (unsaved) copy of config shown by the toggles
let results = null;
let sortKey = 'score';
let sortAsc = true;
let currentProposal = null;

const TYPES = ['agents', 'commands', 'rules', 'skills'];
let arenas = {}; // id -> {status, points, ...} from /api/arena/status

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.method && opts.method !== 'GET' ? { 'X-Auth-Token': TOKEN } : {}) };
  const res = await fetch(path, { ...opts, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.data;
}

function banner(msg, kind = 'error') {
  const el = $('#banner');
  el.textContent = msg;
  el.className = `banner ${kind}`;
  if (kind === 'ok') setTimeout(() => el.classList.add('hidden'), 4000);
}

function scoreClass(s) {
  if (s === null || s === undefined) return '';
  return s >= 90 ? 'score-good' : s >= 70 ? 'score-warn' : 'score-bad';
}

// ---------- config / toggles ----------

function renderToggles() {
  $('#master-toggle').checked = staged.enabled;
  $('#llm-toggle').checked = staged.llmReview.enabled;
  $('#target-label').textContent = staged.target;

  const wrap = $('#type-toggles');
  wrap.innerHTML = '';
  for (const t of TYPES) {
    const byType = results?.summary?.byType?.[t];
    const stat = byType && byType.count
      ? `${byType.count} items · avg ${byType.avgScore ?? '–'}`
      : byType && !byType.enabled ? 'excluded' : '–';
    const div = document.createElement('div');
    div.className = 'type-toggle';
    div.innerHTML = `
      <label class="switch">
        <input type="checkbox" data-type="${t}" ${staged.targets[t] ? 'checked' : ''}>
        <span class="slider"></span>
        <span class="switch-label">${t}</span>
      </label>
      <span class="type-stat">${stat}</span>`;
    wrap.appendChild(div);
  }
  wrap.querySelectorAll('input[data-type]').forEach((input) => {
    input.addEventListener('change', () => {
      staged.targets[input.dataset.type] = input.checked;
      markDirty();
    });
  });
}

function markDirty() {
  const dirty = JSON.stringify(staged) !== JSON.stringify(config);
  $('#save-config').disabled = !dirty;
}

$('#master-toggle').addEventListener('change', (e) => { staged.enabled = e.target.checked; markDirty(); });
$('#llm-toggle').addEventListener('change', (e) => { staged.llmReview.enabled = e.target.checked; markDirty(); });

$('#save-config').addEventListener('click', async () => {
  try {
    config = await api('/api/config', { method: 'PUT', body: JSON.stringify(staged) });
    staged = structuredClone(config);
    markDirty();
    banner('Config saved.', 'ok');
  } catch (e) {
    banner(`Saving config failed: ${e.message}`);
  }
});

// ---------- summary + table ----------

function renderSummary() {
  const cards = $('#summary-cards');
  cards.innerHTML = '';
  if (!results || results.disabled) {
    cards.innerHTML = '<div class="card"><div class="v">—</div><div class="k">no results yet</div></div>';
    $('#run-time').textContent = results?.disabled ? 'system is disabled' : '';
    return;
  }
  const s = results.summary;
  const mk = (v, k, cls = '') => `<div class="card ${cls}"><div class="v ${scoreClass(typeof v === 'number' ? v : null)}">${v ?? '–'}</div><div class="k">${k}</div></div>`;
  cards.innerHTML =
    mk(s.avgScore, 'average score') +
    mk(s.evaluated, 'evaluated') +
    mk(s.skipped, 'excluded') +
    TYPES.map((t) => {
      const b = s.byType[t];
      return mk(b.enabled ? b.avgScore : 'OFF', t, b.enabled ? '' : 'off');
    }).join('');
  $('#run-time').textContent = `last run ${new Date(results.generatedAt).toLocaleString()} · target ${results.target}`;
}

function renderTable() {
  const tbody = $('#artifacts tbody');
  tbody.innerHTML = '';
  if (!results || results.disabled) return;
  const q = $('#filter').value.toLowerCase();

  let rows = results.artifacts.filter((a) => {
    if (!q) return true;
    return a.id.toLowerCase().includes(q) || a.type.includes(q) ||
      (a.findings ?? []).some((f) => f.message.toLowerCase().includes(q) || f.code.includes(q));
  });
  rows.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = av === null ? 1 : bv === null ? -1 : av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  for (const a of rows) {
    const tr = document.createElement('tr');
    tr.className = 'artifact-row' + (a.skipped ? ' skipped' : '');
    const errs = (a.findings ?? []).filter((f) => f.severity === 'error').length;
    const warns = (a.findings ?? []).filter((f) => f.severity === 'warn').length;
    const infos = (a.findings ?? []).filter((f) => f.severity === 'info').length;
    const fsum = a.skipped ? 'excluded' : [errs && `${errs} error${errs > 1 ? 's' : ''}`, warns && `${warns} warn`, infos && `${infos} info`].filter(Boolean).join(' · ') || 'clean';
    const arena = arenas[a.id];
    const arenaCell = a.skipped ? '' : arena
      ? `<button class="small arena-badge ${arena.status}" data-arena="${esc(a.id)}">${arena.status === 'active' ? `${arena.points.champion}:${arena.points.challenger}` : arena.status}</button>`
      : `<button class="small" data-arena="${esc(a.id)}">Arena</button>`;
    tr.innerHTML = `
      <td class="score ${scoreClass(a.score)}">${a.score ?? '–'}</td>
      <td>${esc(a.id)}${a.llm?.summary ? `<div class="muted">LLM: ${esc(a.llm.summary)}</div>` : ''}</td>
      <td><span class="type-chip">${a.type}</span></td>
      <td class="muted">${fsum}</td>
      <td>${arenaCell}</td>
      <td>${a.skipped ? '' : `<button class="small" data-upgrade="${esc(a.id)}">Propose upgrade</button>`}</td>`;
    tbody.appendChild(tr);

    if (!a.skipped && (a.findings?.length || a.llm?.suggestions?.length)) {
      const ftr = document.createElement('tr');
      ftr.className = 'findings-row hidden';
      const list = [
        ...(a.findings ?? []).map((f) => `<div class="finding"><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span><span>${esc(f.message)}</span></div>`),
        ...(a.llm?.suggestions ?? []).map((s) => `<div class="finding"><span class="sev info">llm</span><span>${esc(s)}</span></div>`),
      ].join('');
      ftr.innerHTML = `<td colspan="6">${list}</td>`;
      tbody.appendChild(ftr);
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        ftr.classList.toggle('hidden');
      });
    }
  }

  tbody.querySelectorAll('button[data-upgrade]').forEach((btn) => {
    btn.addEventListener('click', () => proposeUpgrade(btn.dataset.upgrade, btn));
  });
  tbody.querySelectorAll('button[data-arena]').forEach((btn) => {
    btn.addEventListener('click', () => openArena(btn.dataset.arena));
  });
}

async function refreshArenas() {
  try {
    const data = await api('/api/arena/status');
    arenas = Object.fromEntries(data.arenas.map((a) => [a.id, a]));
  } catch {
    arenas = {};
  }
}

$('#filter').addEventListener('input', renderTable);
document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (sortKey === k) sortAsc = !sortAsc; else { sortKey = k; sortAsc = true; }
    renderTable();
  });
});

// ---------- run ----------

$('#run-btn').addEventListener('click', async () => {
  const btn = $('#run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">◐</span> Running…';
  try {
    results = await api('/api/run', { method: 'POST' });
    if (results.disabled) banner('System is disabled — enable the master toggle and save.', 'error');
    else banner(`Evaluated ${results.summary.evaluated} artifacts.`, 'ok');
    renderSummary();
    renderTable();
    renderToggles();
  } catch (e) {
    banner(`Run failed: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run evaluation';
  }
});

// ---------- upgrade proposals ----------

async function proposeUpgrade(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">◐</span>';
  try {
    const data = await api('/api/upgrade', { method: 'POST', body: JSON.stringify({ id }) });
    showProposal(id, data.proposal, data.applyAllowed);
  } catch (e) {
    banner(`Upgrade generation failed: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Propose upgrade';
  }
}

function showProposal(id, proposal, applyAllowed) {
  currentProposal = { id };
  $('#proposal-title').textContent = `Proposal — ${id}`;
  $('#proposal-body').textContent = proposal;
  $('#apply-btn').disabled = !applyAllowed;
  $('#proposal-note').textContent = applyAllowed
    ? 'Applying writes the file with a timestamped .bak backup. Refused if the file changed since generation.'
    : 'Hooks are executable code — apply manually after review.';
  $('#proposal-modal').showModal();
}

$('#close-modal').addEventListener('click', () => $('#proposal-modal').close());
$('#apply-btn').addEventListener('click', async () => {
  if (!currentProposal) return;
  if (!window.confirm(`Overwrite ${currentProposal.id} with this proposal? A backup is kept.`)) return;
  try {
    const data = await api('/api/apply', { method: 'POST', body: JSON.stringify({ id: currentProposal.id, confirm: true }) });
    banner(`Applied. Backup: ${data.backup}`, 'ok');
    $('#proposal-modal').close();
  } catch (e) {
    banner(`Apply failed: ${e.message}`);
  }
});

// ---------- arena ----------

let currentArenaId = null;

async function openArena(id) {
  currentArenaId = id;
  $('#arena-title').textContent = `Arena — ${id}`;
  $('#arena-modal').showModal();
  await renderArena();
}

async function renderArena() {
  const id = currentArenaId;
  let detail = null;
  try { detail = await api(`/api/arena/detail?id=${encodeURIComponent(id)}`); } catch { /* no arena yet */ }

  const hasActive = detail?.ledger?.status === 'active';
  $('#arena-new').disabled = hasActive;
  for (const sel of ['#arena-duel-1', '#arena-duel-3', '#arena-promote', '#arena-discard']) $(sel).disabled = !hasActive;

  if (!detail) {
    $('#arena-scoreboard').innerHTML = '<p class="muted">No arena yet. Generate a challenger to start the duel: the current file is the champion; a generated variant challenges it. Blind duels award points; the challenger takes the slot only if it reaches its threshold before the champion reaches the (lower) defend threshold.</p>';
    $('#arena-hint').textContent = '';
    $('#arena-tasks').innerHTML = '';
    $('#arena-history').innerHTML = '';
    $('#arena-champion').textContent = '';
    $('#arena-challenger').textContent = '';
    return;
  }

  const l = detail.ledger;
  const bar = (label, pts, cls, total) => `
    <div class="score-row">
      <span class="score-label">${label}</span>
      <div class="score-track"><div class="score-fill ${cls}" style="width:${Math.min(100, (pts / total) * 100)}%"></div></div>
      <span class="score-pts">${pts}/${total}</span>
    </div>`;
  $('#arena-scoreboard').innerHTML =
    `<p class="muted">status: <strong>${esc(l.status)}</strong>${l.promotion ? ` — promoted ${new Date(l.promotion.at).toLocaleString()}, backup: ${esc(l.promotion.backup)}` : ''}</p>` +
    bar('Champion', l.points.champion, 'champ', l.pointsToDefend ?? l.pointsToWin) + bar('Challenger', l.points.challenger, 'chall', l.pointsToWin);
  $('#arena-hint').textContent = hasActive
    ? 'Each duel: both variants answer the same task in parallel, a blind judge (randomized order) picks the winner, +1 point. The challenger is auto-promoted (timestamped backup kept) if it fills its bar first; the champion defends by filling its shorter bar.'
    : '';

  $('#arena-tasks').innerHTML = (detail.tasks ?? []).map((t) => `<li>${esc(t.prompt)}</li>`).join('') || '<li class="muted">none</li>';
  $('#arena-history').innerHTML = (l.duels ?? []).slice().reverse().map((d) => `
    <div class="finding"><span class="sev ${d.winner === 'challenger' ? 'warn' : 'info'}">${d.winner}</span>
    <span><strong>${new Date(d.at).toLocaleString()}</strong> — ${esc(d.reasoning)}<div class="muted">task: ${esc(d.task)}</div></span></div>`).join('') || '<p class="muted">no duels yet</p>';
  $('#arena-champion').textContent = detail.championContent ?? '(file missing)';
  $('#arena-challenger').textContent = detail.challengerContent ?? '(none)';
}

async function arenaAction(label, btnSel, fn) {
  const btn = $(btnSel);
  const old = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">◐</span>';
  try {
    await fn();
    await refreshArenas();
    await renderArena();
    renderTable();
  } catch (e) {
    banner(`${label} failed: ${e.message}`);
  } finally {
    btn.textContent = old;
  }
}

$('#arena-new').addEventListener('click', () =>
  arenaAction('Challenger generation', '#arena-new', () => api('/api/arena/challenger', { method: 'POST', body: JSON.stringify({ id: currentArenaId }) })));
$('#arena-duel-1').addEventListener('click', () =>
  arenaAction('Duel', '#arena-duel-1', () => api('/api/arena/duel', { method: 'POST', body: JSON.stringify({ id: currentArenaId, rounds: 1 }) })));
$('#arena-duel-3').addEventListener('click', () =>
  arenaAction('Duels', '#arena-duel-3', () => api('/api/arena/duel', { method: 'POST', body: JSON.stringify({ id: currentArenaId, rounds: 3 }) })));
$('#arena-promote').addEventListener('click', () => {
  if (!window.confirm(`Promote the challenger over ${currentArenaId} now, before the points threshold? A backup is kept.`)) return;
  arenaAction('Promotion', '#arena-promote', () => api('/api/arena/promote', { method: 'POST', body: JSON.stringify({ id: currentArenaId, confirm: true }) }));
});
$('#arena-discard').addEventListener('click', () => {
  if (!window.confirm(`Discard the challenger for ${currentArenaId}?`)) return;
  arenaAction('Discard', '#arena-discard', () => api('/api/arena/discard', { method: 'POST', body: JSON.stringify({ id: currentArenaId, confirm: true }) }));
});
$('#arena-close').addEventListener('click', () => $('#arena-modal').close());

// ---------- init ----------

(async function init() {
  try {
    config = await api('/api/config');
    staged = structuredClone(config);
    try { results = await api('/api/results/latest'); } catch { results = null; }
    await refreshArenas();
    renderToggles();
    renderSummary();
    renderTable();
    if (!TOKEN) banner('No session token in URL — viewing works, but Run/Save/Upgrade/Arena will be rejected. Open the exact URL the server printed.');
  } catch (e) {
    banner(`Failed to load: ${e.message}`);
  }
})();
