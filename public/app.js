import { TYPES, status, selectRows, summarize, toCsv } from './model.js';
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en-SG');
const time = value => new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
let snapshot, filtered = [], page = 1, busy = false;
const pageSize = 20;
function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function render() {
  if (!snapshot) return;
  filtered = selectRows(snapshot.rows, Object.fromEntries(['query', 'type', 'availability', 'sort'].map(key => [key, $(key).value])));
  const totals = summarize(filtered);
  for (const key of ['available', 'carparks', 'limited']) $(key).textContent = number.format(totals[key]);
  $('occupancy').textContent = totals.occupancy === null ? '—' : `${(totals.occupancy * 100).toFixed(1)}%`;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pages);
  $('rows').replaceChildren();
  for (const row of filtered.slice((page - 1) * pageSize, page * pageSize)) {
    const tr = document.createElement('tr');
    const code = document.createElement('td');
    code.append(text('strong', row.id), text('span', TYPES[row.type], 'lot-type'));
    const available = document.createElement('td');
    available.append(text('strong', number.format(row.available)), text('span', ` / ${number.format(row.capacity)}`, 'muted'));
    const ratio = document.createElement('td');
    const meter = document.createElement('meter');
    meter.min = 0; meter.max = 1; meter.value = row.availability ?? 0;
    meter.setAttribute('aria-label', `${row.id} available proportion`);
    ratio.append(meter, text('span', row.availability === null ? 'N/A' : `${Math.round(row.availability * 100)}%`, 'percent'));
    const state = document.createElement('td');
    state.append(text('span', status(row), `pill ${status(row).toLowerCase().replace(' ', '-')}`));
    tr.append(code, available, ratio, state, text('td', time(row.updatedAt), 'timestamp'));
    $('rows').append(tr);
  }
  $('empty').hidden = filtered.length !== 0;
  $('result-count').textContent = `${number.format(filtered.length)} lot-type records · ${number.format(totals.carparks)} carparks`;
  $('page-info').textContent = `Page ${page} of ${pages}`;
  $('previous').disabled = page === 1;
  $('next').disabled = page === pages;
  $('export').disabled = !filtered.length;
}
async function load() {
  if (busy) return;
  busy = true; $('refresh').disabled = true; $('refresh').textContent = 'Refreshing…';
  try {
    const response = await fetch('/api/carparks', { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('Unable to retrieve data. Please try refreshing shortly.');
    snapshot = await response.json();
    $('badge').textContent = snapshot.mode === 'demo' ? 'Demo data' : snapshot.stale ? 'Stale snapshot' : 'Latest snapshot';
    $('updated').textContent = `Snapshot · ${time(snapshot.timestamp)} SGT`;
    const notes = [];
    if (snapshot.mode === 'demo') notes.push('Demo mode: synthetic sample records, not current parking availability.');
    else if (snapshot.stale) notes.push('This snapshot is delayed or the source is unavailable. Check the timestamps before relying on it.');
    if (snapshot.excluded) notes.push(`${snapshot.excluded} invalid or duplicate records were excluded.`);
    $('notice').textContent = notes.join(' '); $('notice').hidden = !notes.length;
    render();
  } catch (error) {
    $('badge').textContent = snapshot ? 'Refresh failed' : 'Unavailable';
    $('notice').textContent = `${error.message}${snapshot ? ' Previous results remain visible and may be out of date.' : ''}`;
    $('notice').hidden = false;
    if (!snapshot) { $('result-count').textContent = 'Could not load carparks.'; $('updated').textContent = 'No snapshot available'; }
  } finally { busy = false; $('refresh').disabled = false; $('refresh').textContent = '↻ Refresh data'; }
}
$('filters').addEventListener('submit', event => event.preventDefault());
$('filters').addEventListener('input', () => { page = 1; render(); });
$('reset').addEventListener('click', () => { $('filters').reset(); page = 1; render(); });
$('refresh').addEventListener('click', load);
for (const [id, delta] of [['previous', -1], ['next', 1]]) $(id).addEventListener('click', () => { page += delta; render(); });
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `park-sg-${snapshot.mode}.csv`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
load();
setInterval(() => { if (!document.hidden) load(); }, 60_000);
