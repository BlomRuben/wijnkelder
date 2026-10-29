'use strict';

// ============================================================
//  Wijnkelder – hoofdlogica
//  Werkwijze: alle gegevens staan in het object `data`.
//  Na elke wijziging roep je commit() aan: dat slaat op en
//  tekent alle schermen opnieuw (de render…-functies).
// ============================================================

const WINE_COLORS = {
  rood:       { label: 'Rood',             hex: '#8e1b3a' },
  wit:        { label: 'Wit',              hex: '#e3c96b' },
  rose:       { label: 'Rosé',             hex: '#ee9fb0' },
  mousserend: { label: 'Mousserend',       hex: '#f3e6b0' },
  dessert:    { label: 'Dessert / zoet',   hex: '#c7882a' },
  versterkt:  { label: 'Port / versterkt', hex: '#5b2416' },
};

const PRIORITIES = { hoog: 'Hoog', middel: 'Middel', laag: 'Laag' };

const COMMON_GRAPES = [
  'Cabernet Sauvignon', 'Merlot', 'Pinot Noir', 'Syrah', 'Shiraz', 'Grenache', 'Tempranillo', 'Sangiovese',
  'Nebbiolo', 'Malbec', 'Zinfandel', 'Pinotage', 'Cabernet Franc', 'Gamay', 'Barbera', 'Touriga Nacional',
  'Chardonnay', 'Sauvignon Blanc', 'Riesling', 'Chenin Blanc', 'Pinot Grigio', 'Grüner Veltliner',
  'Viognier', 'Gewürztraminer', 'Albariño', 'Verdejo', 'Furmint', 'Muscat',
];

let data = null;              // wordt bij het opstarten geladen (zie init)
let photos = {};              // { wijnId: dataUrl }, wordt bij het opstarten geladen
let formPhoto = null;         // foto in het geopende wijnformulier
let currentTab = 'overzicht';
let selectedRackId = null;
let highlightWineId = null;   // wijn die oplicht in de rekweergave
let editingWineId = null;
let editingWishId = null;
let editingRackId = null;
let pendingPlacement = null;  // positie waar een nieuwe wijn direct in komt
let pendingWishId = null;     // wens die verdwijnt zodra de gekochte wijn is opgeslagen
let detailCtx = null;
let placeCtx = null;

// ---------- Hulpfuncties ----------

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) { return n == null ? '–' : euro.format(n); }
function num(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function sum(list, fn) { return list.reduce((t, x) => t + (fn(x) || 0), 0); }
function rowLabel(i) { return i < 26 ? String.fromCharCode(65 + i) : 'R' + (i + 1); }

function getWine(id) { return data.wines.find(w => w.id === id); }
function getRack(id) { return data.racks.find(r => r.id === id); }
function placed(w) { return w.positions.length; }
function unplaced(w) { return Math.max(0, w.quantity - placed(w)); }
function inStock() { return data.wines.filter(w => w.quantity > 0); }
function colorOf(w) { return WINE_COLORS[w.color] || WINE_COLORS.rood; }
function wineTitle(w) { return w.vintage ? `${w.name} ${w.vintage}` : w.name; }
function origin(w) { return [w.region, w.country].filter(Boolean).join(', '); }
function bottleValue(w) { return w.value ?? w.purchasePrice ?? 0; }
function posLabel(p) { const r = getRack(p.rackId); return `${r ? r.name : '?'} · ${rowLabel(p.row)}${p.col + 1}`; }

function drinkWindow(w) {
  if (!w.drinkFrom && !w.drinkUntil) return '';
  const year = new Date().getFullYear();
  const range = `${w.drinkFrom ?? '…'} – ${w.drinkUntil ?? '…'}`;
  if (w.drinkFrom && year < w.drinkFrom) return `${range} (nog te jong)`;
  if (w.drinkUntil && year > w.drinkUntil) return `${range} (over zijn hoogtepunt)`;
  return `${range} (op dronk)`;
}

function dot(w) { return `<span class="dot" style="background:${colorOf(w).hex}"></span>`; }

// Kleur van het glas per soort wijn, voor de getekende fles
const GLASS_COLORS = {
  rood: '#1f3a24', wit: '#a9bd8c', rose: '#f1c2cb', mousserend: '#2d4a2b', dessert: '#9a6a22', versterkt: '#1c1a17',
};

// Een getekende fles (SVG) met naam en jaargang op het etiket
function bottleSvg(w) {
  const label = (w.name || '').length > 14 ? w.name.slice(0, 13) + '…' : (w.name || '');
  return `<svg class="bottle-svg" viewBox="0 0 60 200" role="img" aria-label="Fles ${esc(wineTitle(w))}">
    <path d="M25 10h10v40c0 8 15 14 15 30v110a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V80c0-16 15-22 15-30z"
          fill="${GLASS_COLORS[w.color] || GLASS_COLORS.rood}"/>
    <path d="M24.5 4h11v34h-11z" fill="${colorOf(w).hex}"/>
    <path d="M18 64c2-4 5-7 7-9" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="12" y="104" width="36" height="54" rx="2" fill="#f7f1e3"/>
    <rect x="12" y="104" width="36" height="5" fill="${colorOf(w).hex}"/>
    <text x="30" y="127" text-anchor="middle" font-size="5.5" font-family="Georgia, serif" fill="#3a2a22">${esc(label)}</text>
    <text x="30" y="140" text-anchor="middle" font-size="7" font-family="Georgia, serif" fill="#8e1b3a">${esc(w.vintage ?? '')}</text>
  </svg>`;
}

// Afbeelding van de fles via de link; lukt het laden niet, dan de getekende fles
function bottleImage(w, cls) {
  const svg = bottleSvg(w);
  if (!isWebUrl(w.imageUrl)) return `<span class="${cls}">${svg}</span>`;
  return `<span class="${cls}"><img src="${esc(w.imageUrl)}" alt="Fles ${esc(wineTitle(w))}" referrerpolicy="no-referrer"
    onerror="this.replaceWith(this.nextElementSibling.content.cloneNode(true))"><template>${svg}</template></span>`;
}

function commit() {
  renderAll();
  dirty = true;
  flushSave();
}

// ---------- Opslaan ----------
// Opslaan gebeurt op de achtergrond, één keer tegelijk. Komen er tijdens het
// opslaan nieuwe wijzigingen bij, dan wordt daarna nog een keer opgeslagen.

let saving = false;
let dirty = false;

async function flushSave() {
  if (saving || !dirty) return;
  saving = true;
  dirty = false;
  try {
    await Storage.save(data);
    showBanner('');
  } catch (err) {
    if (err instanceof ConflictError) {
      dirty = false;
      alert('Je kelder is intussen op een ander apparaat gewijzigd. De nieuwste versie wordt geladen; ' +
            'je laatste wijziging is niet bewaard, voer die zo nodig opnieuw in.');
      await reloadData();
    } else {
      dirty = true;
      showBanner(`Opslaan mislukt: ${err.message} Je wijzigingen staan nog alleen op dit scherm; ` +
                 'de app probeert het opnieuw zodra je weer iets wijzigt.');
    }
  } finally {
    saving = false;
    if (dirty && !document.querySelector('#banner:not([hidden])')) flushSave();
  }
}

// Haalt de nieuwste gegevens (en foto's) op, bijv. na een wijziging op een ander apparaat
async function reloadData() {
  try {
    data = await Storage.load();
    photos = await Photos.getAll();
    showBanner('');
  } catch (err) {
    showBanner('Kon de gegevens niet ophalen: ' + err.message);
  }
  renderAll();
}

function showBanner(message) {
  $('#banner').textContent = message;
  $('#banner').hidden = !message;
}

// ---------- Tabs ----------

function showTab(name) {
  currentTab = name;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  if (name === 'kaart') renderMap();
}

// ---------- Overzicht ----------

function tile(label, value, sub) {
  return `<div class="tile"><span class="tile-label">${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
}

function bars(entries) {
  if (!entries.length) return '<p class="muted">Nog geen gegevens.</p>';
  const max = Math.max(...entries.map(e => e.n));
  return entries.map(e => `
    <div class="bar-row">
      <span class="bar-label">${esc(e.label)}</span>
      <div class="bar-track"><div class="bar" style="width:${(e.n / max) * 100}%;background:${e.color || 'var(--accent)'}"></div></div>
      <span class="bar-val">${e.n}</span>
    </div>`).join('');
}

function miniList(wines, right, empty = 'Nog geen gegevens.') {
  if (!wines.length) return `<p class="muted">${empty}</p>`;
  return `<ul class="mini">${wines.map(w => `
    <li data-wine="${w.id}">${dot(w)}
      <span class="grow">${esc(wineTitle(w))}<small>${esc(w.producer || '')}</small></span>
      <strong>${esc(right(w))}</strong>
    </li>`).join('')}</ul>`;
}

function renderOverview() {
  const el = $('#tab-overzicht');
  if (!data.wines.length && !data.wishlist.length) {
    el.innerHTML = `
      <div class="empty-state card">
        <h2>Welkom in je wijnkelder 🍷</h2>
        <p>Je hebt nog geen wijnen ingevoerd. Begin met je eerste fles, of laad voorbeelddata om alles uit te proberen.</p>
        <div class="row">
          <button class="primary" data-action="add-wine">+ Eerste wijn toevoegen</button>
          <button data-action="load-sample">Voorbeelddata laden</button>
        </div>
      </div>`;
    return;
  }

  const stock = inStock();
  const year = new Date().getFullYear();
  const bottles = sum(stock, w => w.quantity);
  const scored = stock.filter(w => w.score != null);
  const avgScore = scored.length ? sum(scored, w => w.score) / scored.length : null;
  const slots = sum(data.racks, r => r.rows * r.cols);
  const used = sum(data.wines, placed);

  const byColor = Object.entries(WINE_COLORS)
    .map(([key, c]) => ({ label: c.label, color: c.hex, n: sum(stock.filter(w => w.color === key), w => w.quantity) }))
    .filter(e => e.n > 0);

  const countryTotals = {};
  stock.forEach(w => { const c = w.country || 'Onbekend'; countryTotals[c] = (countryTotals[c] || 0) + w.quantity; });
  const byCountry = Object.entries(countryTotals).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 8);

  const topScore = scored.slice().sort((a, b) => b.score - a.score).slice(0, 5);
  const topValue = stock.filter(w => bottleValue(w) > 0).sort((a, b) => bottleValue(b) - bottleValue(a)).slice(0, 5);
  const drinkSoon = stock.filter(w => w.drinkUntil && w.drinkUntil <= year + 1).sort((a, b) => a.drinkUntil - b.drinkUntil);

  el.innerHTML = `
    <div class="tiles">
      ${tile('Flessen', bottles, `${stock.length} verschillende wijnen`)}
      ${tile('Totale waarde', money(sum(stock, w => w.quantity * bottleValue(w))), `aankoop ${money(sum(stock, w => w.quantity * (w.purchasePrice || 0)))}`)}
      ${tile('Gem. score', avgScore == null ? '–' : avgScore.toFixed(1), `${scored.length} wijnen met score`)}
      ${tile('Plek in rekken', `${used} / ${slots}`, `${slots - used} vakken vrij`)}
      ${tile('Wensenlijst', data.wishlist.length, 'wijnen')}
      ${tile('Gedronken', sum(data.wines, w => w.drunk), 'flessen tot nu toe')}
    </div>
    <div class="cards">
      <div class="card"><h3>Per kleur</h3>${bars(byColor)}</div>
      <div class="card"><h3>Per land</h3>${bars(byCountry)}</div>
      <div class="card"><h3>Hoogste scores</h3>${miniList(topScore, w => w.score)}</div>
      <div class="card"><h3>Meest waardevol (per fles)</h3>${miniList(topValue, w => money(bottleValue(w)))}</div>
      <div class="card"><h3>Binnenkort opdrinken</h3>${miniList(drinkSoon, w => `t/m ${w.drinkUntil}`, 'Niets dat binnenkort op moet.')}</div>
    </div>`;
}

// ---------- Wijnenlijst ----------

const SORTERS = {
  name:    (a, b) => a.name.localeCompare(b.name),
  vintage: (a, b) => (a.vintage || 9999) - (b.vintage || 9999),
  score:   (a, b) => (b.score ?? -1) - (a.score ?? -1),
  value:   (a, b) => bottleValue(b) - bottleValue(a),
  country: (a, b) => (a.country || '').localeCompare(b.country || ''),
};

function renderWineList() {
  const q = normalizeName($('#wine-search').value);
  const color = $('#wine-filter-color').value;
  const showEmpty = $('#wine-show-empty').checked;

  const list = data.wines
    .filter(w => showEmpty || w.quantity > 0)
    .filter(w => !color || w.color === color)
    .filter(w => !q || normalizeName([w.name, w.producer, w.grape, w.country, w.region, w.vintage].join(' ')).includes(q))
    .sort(SORTERS[$('#wine-sort').value]);

  if (!list.length) {
    $('#wine-list').innerHTML = `<p class="muted">${data.wines.length ? 'Geen wijnen gevonden.' : 'Nog geen wijnen. Klik op “+ Wijn toevoegen”.'}</p>`;
    return;
  }

  $('#wine-list').innerHTML = `
    <div class="table-wrap"><table class="table">
      <thead><tr>
        <th></th><th>Wijn</th><th>Jaar</th><th>Herkomst</th><th>Druif</th>
        <th class="num">Flessen</th><th class="num">Waarde/fles</th><th class="num">Score</th>
      </tr></thead>
      <tbody>${list.map(w => `
        <tr data-wine="${w.id}" class="${w.quantity ? '' : 'is-empty'}">
          <td>${isWebUrl(w.imageUrl) ? bottleImage(w, 'thumb-bottle')
              : photos[w.id] ? `<img class="thumb" src="${photos[w.id]}" alt="">` : dot(w)}</td>
          <td><strong>${esc(w.name)}</strong><small>${esc(w.producer || '')}</small></td>
          <td>${w.vintage ?? '–'}</td>
          <td>${esc(origin(w)) || '–'}</td>
          <td>${esc(w.grape) || '–'}</td>
          <td class="num">${w.quantity}${unplaced(w) ? `<small>${unplaced(w)} niet in rek</small>` : ''}</td>
          <td class="num">${money(w.value ?? w.purchasePrice)}</td>
          <td class="num">${w.score ?? '–'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

// ---------- Rekken ----------

function findAt(rackId, row, col) {
  for (const w of data.wines) {
    const p = w.positions.find(p => p.rackId === rackId && p.row === row && p.col === col);
    if (p) return { w, p };
  }
  return null;
}

function renderRacks() {
  if (!getRack(selectedRackId)) selectedRackId = data.racks[0]?.id ?? null;
  const rack = getRack(selectedRackId);

  $('#rack-tabs').innerHTML = data.racks.map(r => {
    const used = sum(data.wines, w => w.positions.filter(p => p.rackId === r.id).length);
    return `<button class="pill ${r.id === selectedRackId ? 'active' : ''}" data-rack="${r.id}">
      ${esc(r.name)} <small>${used}/${r.rows * r.cols}</small></button>`;
  }).join('');
  $('#btn-edit-rack').disabled = !rack;

  if (!rack) {
    $('#rack-view').innerHTML = '<p class="muted">Nog geen rekken. Klik op “+ Rek toevoegen”.</p>';
    return;
  }

  const occupied = new Map();
  data.wines.forEach(w => w.positions.forEach(p => {
    if (p.rackId === rack.id) occupied.set(`${p.row},${p.col}`, w);
  }));

  let cells = '<div></div>';
  for (let c = 0; c < rack.cols; c++) cells += `<div class="axis">${c + 1}</div>`;
  for (let r = 0; r < rack.rows; r++) {
    cells += `<div class="axis">${rowLabel(r)}</div>`;
    for (let c = 0; c < rack.cols; c++) {
      const w = occupied.get(`${r},${c}`);
      const pos = `${rowLabel(r)}${c + 1}`;
      cells += w
        ? `<button class="cell ${w.id === highlightWineId ? 'hl' : ''}" data-cell="${r},${c}" title="${esc(wineTitle(w))} (${pos})">
             <span class="bottle" style="--c:${colorOf(w).hex}"></span></button>`
        : `<button class="cell" data-cell="${r},${c}" title="Leeg (${pos})"><span class="slot"></span></button>`;
    }
  }

  const waiting = data.wines.filter(w => unplaced(w) > 0);
  $('#rack-view').innerHTML = `
    <div class="rack-wrap">
      <div class="rack" style="grid-template-columns: 1.6rem repeat(${rack.cols}, var(--cell))">${cells}</div>
    </div>
    <div class="legend">${Object.values(WINE_COLORS).map(c =>
      `<span><span class="dot" style="background:${c.hex}"></span>${c.label}</span>`).join('')}</div>
    ${waiting.length ? `<div class="card"><h3>Nog niet in een rek</h3>
      ${miniList(waiting, w => `${unplaced(w)} fl.`)}</div>` : ''}`;
}

function onRackCellClick(e) {
  const cell = e.target.closest('[data-cell]');
  if (!cell) return;
  const [row, col] = cell.dataset.cell.split(',').map(Number);
  highlightWineId = null;
  const hit = findAt(selectedRackId, row, col);
  if (hit) openDetail(hit.w.id, hit.p);
  else openPlace(selectedRackId, row, col);
  renderRacks();
}

// Fles plaatsen in een leeg vak
function openPlace(rackId, row, col) {
  placeCtx = { rackId, row, col };
  $('#place-title').textContent = `Fles leggen op ${posLabel(placeCtx)}`;
  $('#place-search').value = '';
  renderPlaceList();
  $('#dlg-place').showModal();
}

function renderPlaceList() {
  const q = normalizeName($('#place-search').value);
  const list = data.wines
    .filter(w => !q || normalizeName(`${w.name} ${w.producer} ${w.vintage}`).includes(q))
    .sort((a, b) => (unplaced(b) > 0) - (unplaced(a) > 0) || a.name.localeCompare(b.name));
  $('#place-list').innerHTML = list.map(w => `
    <button class="place-item" data-place="${w.id}">${dot(w)}
      <span class="grow">${esc(wineTitle(w))}<small>${esc(w.producer || '')}</small></span>
      <small>${unplaced(w) ? `${unplaced(w)} nog niet in rek` : '+1 fles erbij'}</small>
    </button>`).join('') || '<p class="muted">Geen wijnen gevonden. Voeg een nieuwe wijn toe.</p>';
}

function placeWine(wineId) {
  const w = getWine(wineId);
  if (!unplaced(w)) w.quantity++;
  w.positions.push({ ...placeCtx });
  $('#dlg-place').close();
  commit();
}

// ---------- Detailvenster van een wijn ----------

function openDetail(wineId, pos = null) {
  const w = getWine(wineId);
  if (!w) return;
  detailCtx = { wineId, pos };
  const c = colorOf(w);

  const facts = [
    ['Producent', w.producer],
    ['Jaargang', w.vintage],
    ['Kleur', c.label],
    ['Druif', w.grape],
    ['Herkomst', origin(w)],
    ['Flessen', `${w.quantity} (${placed(w)} in rek)`],
    ['Aankoopprijs', w.purchasePrice != null ? money(w.purchasePrice) : ''],
    ['Huidige waarde', w.value != null ? money(w.value) : ''],
    ['Score', w.score != null ? `${w.score}${w.scoreSource ? ` (${w.scoreSource})` : ''}` : ''],
    ['Drinkvenster', drinkWindow(w)],
    ['Gedronken', w.drunk || ''],
    ['Toegevoegd', w.added],
  ].filter(([, v]) => v != null && v !== '');

  $('#detail-body').innerHTML = `
    <div class="detail-layout">
      <div class="detail-main">
        <h2>${esc(wineTitle(w))}</h2>
        ${pos ? `<p class="muted">Ligt op ${esc(posLabel(pos))}</p>` : ''}
        <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${w.notes ? `<p class="notes">${esc(w.notes)}</p>` : ''}
        ${isWebUrl(w.vivinoUrl) ? `<p><a href="${esc(w.vivinoUrl)}" target="_blank" rel="noopener">Bekijk op Vivino ↗</a></p>` : ''}
        ${!pos && w.positions.length ? `<p class="muted small">In rek: ${esc(w.positions.map(posLabel).join(', '))}</p>` : ''}
      </div>
      <div class="detail-media">
        ${bottleImage(w, 'detail-bottle')}
        ${photos[w.id] ? `<img class="detail-photo" src="${photos[w.id]}" alt="Jouw foto van ${esc(w.name)}">` : ''}
      </div>
    </div>`;

  $('#detail-actions').innerHTML = `
    <button class="primary" data-detail="drink" ${w.quantity ? '' : 'disabled'}>🍷 Fles gedronken</button>
    ${pos ? '<button data-detail="unplace">Uit rek halen</button>' : ''}
    ${!pos && w.positions.length ? '<button data-detail="show">Toon in rek</button>' : ''}
    <button data-detail="edit">Bewerken</button>
    <button class="danger" data-detail="delete">Verwijderen</button>
    <span class="spacer"></span>
    <button data-detail="close">Sluiten</button>`;

  $('#dlg-detail').showModal();
}

function onDetailAction(e) {
  const btn = e.target.closest('[data-detail]');
  if (!btn) return;
  const w = getWine(detailCtx.wineId);
  const pos = detailCtx.pos;
  const dlg = $('#dlg-detail');

  switch (btn.dataset.detail) {
    case 'drink':
      // Uit het rek als hij daar ligt; anders eerst een fles die nog niet in een rek lag
      if (pos) w.positions = w.positions.filter(p => p !== pos);
      else if (!unplaced(w)) w.positions.pop();
      w.quantity = Math.max(0, w.quantity - 1);
      w.drunk = (w.drunk || 0) + 1;
      break;
    case 'unplace':
      w.positions = w.positions.filter(p => p !== pos);
      break;
    case 'show':
      highlightWineId = w.id;
      selectedRackId = w.positions[0].rackId;
      dlg.close();
      showTab('rekken');
      renderRacks();
      return;
    case 'edit':
      dlg.close();
      openWineForm(w);
      return;
    case 'delete':
      if (!confirm(`“${wineTitle(w)}” helemaal verwijderen?`)) return;
      data.wines = data.wines.filter(x => x !== w);
      savePhoto(w.id, null);
      break;
    case 'close':
      dlg.close();
      return;
  }
  dlg.close();
  commit();
}

// ---------- Formulieren ----------

function fillForm(form, values) {
  for (const el of form.elements) {
    if (el.name) el.value = values[el.name] ?? '';
  }
}

function readForm(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    values[el.name] = el.type === 'number' ? num(el.value) : el.value.trim();
  }
  return values;
}

function openWineForm(wine = null, prefill = {}) {
  editingWineId = wine?.id ?? null;
  $('#wine-form-title').textContent = wine ? 'Wijn bewerken' : 'Wijn toevoegen';
  fillForm($('#form-wine'), wine || { color: 'rood', quantity: 1, ...prefill });
  $$('#form-wine .ai-filled, #form-wine .ai-changed').forEach(el => {
    el.classList.remove('ai-filled', 'ai-changed');
    el.removeAttribute('title');
  });
  setAiStatus('Vul een naam (en jaargang) in, of kies een foto van het etiket, en klik op “Automatisch aanvullen”.');
  formPhoto = wine ? photos[wine.id] ?? null : null;
  renderFormPhoto();
  renderFormBottle();
  $('#dlg-wine').showModal();
}

// Voorbeeld van de fles in het formulier, op basis van wat er nu is ingevuld
function renderFormBottle() {
  const form = $('#form-wine');
  $('#wine-bottle-box').innerHTML = bottleImage({
    name: form.elements.name.value.trim(),
    vintage: num(form.elements.vintage.value),
    color: form.elements.color.value,
    imageUrl: form.elements.imageUrl.value.trim(),
  }, 'form-bottle');
}

// ---------- Foto's ----------

function renderFormPhoto() {
  $('#wine-photo-box').innerHTML = formPhoto
    ? `<img src="${formPhoto}" alt="Foto van het etiket">`
    : '<span class="muted small">Geen foto</span>';
  $('#btn-photo-remove').hidden = !formPhoto;
}

// Verkleint een foto tot max. 1000 pixels, zodat hij weinig ruimte inneemt
function resizeImage(file, maxSize = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Dit bestand kon niet als foto worden geopend.'));
    img.src = URL.createObjectURL(file);
  });
}

// Bewaart (of verwijdert, bij dataUrl = null) de foto van een wijn
function savePhoto(id, dataUrl) {
  if (dataUrl) photos[id] = dataUrl;
  else delete photos[id];
  (dataUrl ? Photos.set(id, dataUrl) : Photos.delete(id))
    .catch(err => alert('De foto kon niet worden opgeslagen: ' + err.message));
}

// ---------- Automatisch aanvullen ----------

const AI_FIELDS = ['name', 'producer', 'vintage', 'color', 'grape', 'country', 'region',
                   'value', 'score', 'scoreSource', 'drinkFrom', 'drinkUntil', 'notes', 'imageUrl', 'vivinoUrl'];

function setAiStatus(message) {
  $('#ai-status').textContent = message;
}

// Stap 1: het venster met de vraag voor Claude openen
function openAiDialog() {
  const form = $('#form-wine');
  if (!form.elements.name.value.trim() && !formPhoto) {
    setAiStatus('Vul eerst een naam in, of kies een foto van het etiket.');
    return;
  }
  $('#ai-photo-step').hidden = !formPhoto;
  $('#ai-copy-done').textContent = '';
  $('#ai-photo-done').textContent = 'en plak die ook in de chat';
  $('#ai-answer').value = '';
  $('#ai-dialog-status').textContent = '';
  $('#dlg-ai').showModal();
}

async function copyAiPrompt() {
  const form = $('#form-wine');
  await WineAI.copyText(WineAI.buildPrompt({
    name: form.elements.name.value.trim(),
    vintage: num(form.elements.vintage.value),
    producer: form.elements.producer.value.trim(),
    hasPhoto: !!formPhoto,
  }));
  $('#ai-copy-done').textContent = '✓ Gekopieerd';
}

async function copyAiPhoto() {
  try {
    await WineAI.copyImage(formPhoto);
    $('#ai-photo-done').textContent = '✓ Gekopieerd, plak hem ook in de chat';
  } catch {
    $('#ai-photo-done').textContent = 'Kopiëren lukte niet. Sleep de foto zelf in de chat.';
  }
}

// Stap 2: het antwoord van Claude in het formulier zetten
function applyAiAnswer() {
  let info;
  try {
    info = WineAI.parseAnswer($('#ai-answer').value);
  } catch (err) {
    $('#ai-dialog-status').textContent = err.message;
    return;
  }
  $('#dlg-ai').close();
  if (!info.found) {
    setAiStatus('Claude kon deze wijn niet vinden. Probeer een preciezere naam of een scherpere foto.');
    return;
  }

  // Wat Claude geeft wint, ook als het veld al gevuld was.
  // Geeft Claude voor een veld niets (null), dan blijft de huidige waarde staan.
  const form = $('#form-wine');
  let filled = 0;
  let changed = 0;
  for (const key of AI_FIELDS) {
    const el = form.elements[key];
    const value = info[key];
    const old = el.value.trim();
    if (value == null || String(value) === old) continue;
    el.value = value;
    // Bij een nieuwe wijn staat de kleur standaard op Rood; dat telt niet als "gewijzigd"
    if (old === '' || (key === 'color' && !editingWineId)) {
      el.classList.add('ai-filled');
      filled++;
    } else {
      el.classList.add('ai-changed');
      el.title = `Was: ${key === 'color' ? WINE_COLORS[old]?.label ?? old : old}`;
      changed++;
    }
  }
  renderFormBottle();
  setAiStatus(`${filled} velden ingevuld en ${changed} gewijzigd (zekerheid: ${info.certainty}). ` +
              'Geel is nieuw, oranje is veranderd (muis erboven toont de oude waarde). ' +
              'Controleer ze even, want prijzen en scores zijn schattingen.');
}

function onWineSubmit(e) {
  e.preventDefault();
  const v = readForm(e.target);
  v.quantity = Math.max(0, Math.round(v.quantity ?? 0));

  let w;
  if (editingWineId) {
    w = getWine(editingWineId);
    if (w.positions.length > v.quantity) {
      const extra = w.positions.length - v.quantity;
      if (!confirm(`Er liggen ${w.positions.length} flessen in een rek, maar het aantal is nu ${v.quantity}. ` +
                   `${extra} fles(sen) worden uit het rek gehaald. Doorgaan?`)) return;
      w.positions = w.positions.slice(0, v.quantity);
    }
    Object.assign(w, v);
  } else {
    w = { id: uid(), positions: [], drunk: 0, added: today(), ...v };
    data.wines.push(w);
  }

  if (pendingPlacement) {
    if (!unplaced(w)) w.quantity++;
    w.positions.push(pendingPlacement);
  }
  if (pendingWishId) data.wishlist = data.wishlist.filter(x => x.id !== pendingWishId);
  if (formPhoto !== (photos[w.id] ?? null)) savePhoto(w.id, formPhoto);

  $('#dlg-wine').close();
  commit();
}

function openWishForm(wish = null) {
  editingWishId = wish?.id ?? null;
  $('#wish-form-title').textContent = wish ? 'Wens bewerken' : 'Wens toevoegen';
  fillForm($('#form-wish'), wish || { color: 'rood', priority: 'middel' });
  $('#dlg-wish').showModal();
}

function onWishSubmit(e) {
  e.preventDefault();
  const v = readForm(e.target);
  if (editingWishId) Object.assign(data.wishlist.find(x => x.id === editingWishId), v);
  else data.wishlist.push({ id: uid(), ...v });
  $('#dlg-wish').close();
  commit();
}

function openRackForm(rack = null) {
  editingRackId = rack?.id ?? null;
  $('#rack-form-title').textContent = rack ? 'Rek bewerken' : 'Rek toevoegen';
  $('#btn-delete-rack').hidden = !rack;
  fillForm($('#form-rack'), rack || { name: `Rek ${data.racks.length + 1}`, rows: 6, cols: 8 });
  $('#dlg-rack').showModal();
}

function onRackSubmit(e) {
  e.preventDefault();
  const v = readForm(e.target);
  if (editingRackId) {
    // Flessen die buiten het nieuwe formaat vallen, gaan uit het rek
    const outside = p => p.rackId === editingRackId && (p.row >= v.rows || p.col >= v.cols);
    const count = sum(data.wines, w => w.positions.filter(outside).length);
    if (count && !confirm(`${count} fles(sen) vallen buiten het nieuwe formaat en worden uit het rek gehaald. Doorgaan?`)) return;
    data.wines.forEach(w => { w.positions = w.positions.filter(p => !outside(p)); });
    Object.assign(getRack(editingRackId), v);
  } else {
    const rack = { id: uid(), ...v };
    data.racks.push(rack);
    selectedRackId = rack.id;
  }
  $('#dlg-rack').close();
  commit();
}

function deleteRack() {
  const rack = getRack(editingRackId);
  if (!confirm(`Rek “${rack.name}” verwijderen? De flessen blijven in je inventaris, maar liggen dan niet meer in een rek.`)) return;
  data.wines.forEach(w => { w.positions = w.positions.filter(p => p.rackId !== rack.id); });
  data.racks = data.racks.filter(r => r !== rack);
  $('#dlg-rack').close();
  commit();
}

// ---------- Wensenlijst ----------

function renderWishlist() {
  const order = Object.keys(PRIORITIES);
  const list = data.wishlist.slice().sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  if (!list.length) {
    $('#wish-list').innerHTML = '<p class="muted">Je wensenlijst is nog leeg.</p>';
    return;
  }
  $('#wish-list').innerHTML = `<div class="wish-grid">${list.map(x => `
    <div class="card wish">
      <div class="wish-head">${dot(x)}
        <div class="grow"><strong>${esc(wineTitle(x))}</strong><small>${esc(x.producer || '')}</small></div>
        <span class="badge prio-${x.priority}">${PRIORITIES[x.priority] || ''}</span>
      </div>
      <p class="muted small">${esc(origin(x)) || 'Herkomst onbekend'}${x.price != null ? ` · ca. ${money(x.price)}` : ''}${x.shop ? ` · ${esc(x.shop)}` : ''}</p>
      ${x.notes ? `<p class="small">${esc(x.notes)}</p>` : ''}
      <div class="row">
        <button class="primary" data-action="buy-wish" data-id="${x.id}">Gekocht!</button>
        <button data-action="edit-wish" data-id="${x.id}">Bewerken</button>
        <button class="danger" data-action="delete-wish" data-id="${x.id}">Verwijderen</button>
      </div>
    </div>`).join('')}</div>`;
}

function buyWish(id) {
  const x = data.wishlist.find(w => w.id === id);
  pendingWishId = id;
  openWineForm(null, {
    name: x.name, producer: x.producer, vintage: x.vintage, color: x.color,
    country: x.country, region: x.region, purchasePrice: x.price, notes: x.notes,
  });
}

// ---------- Kaart ----------

let map = null;
let markerLayer = null;
const markersByLabel = {};

function renderMap() {
  const side = $('#map-side');
  if (typeof L === 'undefined') {
    $('#map').innerHTML = '<p class="muted pad">De kaart kon niet laden. Heb je internetverbinding?</p>';
    return;
  }
  if (!map) {
    map = L.map('map', { worldCopyJump: true }).setView([30, 10], 2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Kaart &copy; Esri',
      maxZoom: 16,
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  const groups = {};
  const unknown = [];
  for (const w of inStock()) {
    const loc = locate(w.country, w.region);
    if (!loc) { unknown.push(w); continue; }
    const g = groups[loc.label] ||= { loc, wines: [], bottles: 0 };
    g.wines.push(w);
    g.bottles += w.quantity;
  }

  markerLayer.clearLayers();
  const list = Object.values(groups).sort((a, b) => b.bottles - a.bottles);
  for (const g of list) {
    const main = g.wines.slice().sort((a, b) => b.quantity - a.quantity)[0];
    const marker = L.circleMarker([g.loc.lat, g.loc.lng], {
      radius: 7 + Math.sqrt(g.bottles) * 4,
      color: '#fff', weight: 2,
      fillColor: colorOf(main).hex, fillOpacity: 0.85,
    }).bindPopup(`
      <strong>${esc(g.loc.label)}</strong> – ${g.bottles} fles(sen)
      <ul class="popup-list">${g.wines.map(w => `<li>${dot(w)}${esc(wineTitle(w))} <small>(${w.quantity})</small></li>`).join('')}</ul>`);
    marker.addTo(markerLayer);
    markersByLabel[g.loc.label] = marker;
  }
  // Leaflet moet opnieuw meten als de tab net zichtbaar is geworden, daarna inzoomen op de flessen
  setTimeout(() => {
    map.invalidateSize();
    if (list.length) map.fitBounds(L.latLngBounds(list.map(g => [g.loc.lat, g.loc.lng])).pad(0.3), { maxZoom: 6 });
  }, 0);

  side.innerHTML = `
    <h3>Herkomst</h3>
    ${list.length ? `<ul class="mini">${list.map(g => `
      <li class="clickable" data-loc="${esc(g.loc.label)}"><span class="grow">${esc(g.loc.label)}</span><strong>${g.bottles}</strong></li>`).join('')}</ul>`
      : '<p class="muted">Nog geen wijnen met een bekend land of regio.</p>'}
    ${unknown.length ? `<p class="muted small">Niet op de kaart (land/regio onbekend): ${esc(unknown.map(wineTitle).join(', '))}</p>` : ''}`;
}

// ---------- Gegevens: back-up, import, voorbeelddata ----------

// Foto's als data-URL's, zodat ze in het back-upbestand passen
async function photosForBackup() {
  const result = {};
  for (const [id, src] of Object.entries(photos)) {
    if (src.startsWith('data:')) {
      result[id] = src;
      continue;
    }
    const blob = await (await fetch(src)).blob();
    result[id] = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
  return result;
}

async function exportData() {
  let backupPhotos;
  try {
    backupPhotos = await photosForBackup();
  } catch (err) {
    alert('De foto\'s konden niet worden opgehaald voor de back-up: ' + err.message);
    return;
  }
  const blob = new Blob([JSON.stringify({ ...data, photos: backupPhotos }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wijnkelder-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const raw = JSON.parse(await file.text());
    const imported = Storage.normalize(raw);
    if (!confirm(`Back-up met ${imported.wines.length} wijnen terugzetten? Je huidige gegevens worden vervangen.`)) return;
    data = imported;
    photos = raw.photos || {};
    await Photos.replaceAll(photos);
    commit();
  } catch (err) {
    alert('Dit bestand kon niet worden ingelezen: ' + err.message);
  }
}

function loadSample() {
  if (data.wines.length && !confirm('Je huidige gegevens worden vervangen door voorbeelddata. Doorgaan?')) return;
  data = sampleData();
  selectedRackId = data.racks[0].id;
  photos = {};
  Photos.clear().catch(err => showBanner('Foto\'s wissen mislukt: ' + err.message));
  commit();
  showTab('overzicht');
}

function clearAll() {
  if (!confirm('Weet je zeker dat je ALLE gegevens wilt wissen? Maak eerst een back-up!')) return;
  data = Storage.empty();
  photos = {};
  Photos.clear().catch(err => showBanner('Foto\'s wissen mislukt: ' + err.message));
  commit();
}

// ---------- Overige ----------

function renderDatalists() {
  const unique = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const options = arr => unique(arr).map(v => `<option value="${esc(v)}">`).join('');
  const all = [...data.wines, ...data.wishlist];
  $('#dl-countries').innerHTML = options([...Object.keys(WINE_COUNTRIES), ...all.map(w => w.country)]);
  $('#dl-regions').innerHTML = options([...WINE_REGIONS.map(r => r.name), ...all.map(w => w.region)]);
  $('#dl-grapes').innerHTML = options([...COMMON_GRAPES, ...data.wines.map(w => w.grape)]);
}

function renderAll() {
  renderOverview();
  renderWineList();
  renderRacks();
  renderWishlist();
  renderDatalists();
  if (currentTab === 'kaart') renderMap();
}

// Eén centrale klik-afhandeling voor knoppen met data-action, data-wine, data-rack, …
function onDocumentClick(e) {
  const action = e.target.closest('[data-action]');
  if (action) {
    const id = action.dataset.id;
    switch (action.dataset.action) {
      case 'add-wine':    openWineForm(); break;
      case 'add-wish':    openWishForm(); break;
      case 'edit-wish':   openWishForm(data.wishlist.find(x => x.id === id)); break;
      case 'buy-wish':    buyWish(id); break;
      case 'delete-wish':
        if (confirm('Deze wens verwijderen?')) { data.wishlist = data.wishlist.filter(x => x.id !== id); commit(); }
        break;
      case 'add-rack':    openRackForm(); break;
      case 'edit-rack':   openRackForm(getRack(selectedRackId)); break;
      case 'export':      exportData(); break;
      case 'import':      $('#import-file').click(); break;
      case 'load-sample': loadSample(); break;
      case 'clear-all':   clearAll(); break;
    }
    return;
  }

  const wineEl = e.target.closest('[data-wine]');
  if (wineEl) return openDetail(wineEl.dataset.wine);

  const rackEl = e.target.closest('[data-rack]');
  if (rackEl) { selectedRackId = rackEl.dataset.rack; highlightWineId = null; return renderRacks(); }

  const locEl = e.target.closest('[data-loc]');
  if (locEl) {
    const m = markersByLabel[locEl.dataset.loc];
    if (m) { map.flyTo(m.getLatLng(), 6); m.openPopup(); }
    return;
  }

  // "Annuleren"-knoppen in dialogen
  if (e.target.matches('[data-close]')) e.target.closest('dialog').close();
}

// Een klik op de donkere achtergrond komt binnen als klik op de dialoog zelf, maar buiten het witte vlak
function isOutsideDialog(dlg, e) {
  if (e.target !== dlg) return false;
  const r = dlg.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

async function init() {
  // Keuzelijsten voor kleur vullen
  const colorOptions = Object.entries(WINE_COLORS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
  $$('.color-select').forEach(s => { s.innerHTML = colorOptions; });
  $('#wine-filter-color').innerHTML += colorOptions;

  $$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.addEventListener('click', onDocumentClick);

  ['#wine-search', '#wine-filter-color', '#wine-sort', '#wine-show-empty']
    .forEach(sel => $(sel).addEventListener('input', renderWineList));

  // Klik naast het wijnvenster of het plaatsvenster (op de donkere achtergrond) sluit het.
  // Niet bij de formulieren: dan raak je met één misklik je invoer kwijt.
  ['#dlg-detail', '#dlg-place'].forEach(sel => {
    const dlg = $(sel);
    let pressedOutside = false;
    // Ook kijken waar je de muis indrukte, zodat tekst selecteren en buiten loslaten het venster niet sluit
    dlg.addEventListener('pointerdown', e => { pressedOutside = isOutsideDialog(dlg, e); });
    dlg.addEventListener('click', e => {
      if (pressedOutside && isOutsideDialog(dlg, e)) dlg.close();
    });
  });

  // Esc sluit altijd het bovenste open venster (ook als de cursor in een veld of keuzelijst staat)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = $$('dialog[open]');
    if (!open.length) return;
    e.preventDefault();
    const top = document.activeElement?.closest('dialog[open]') || open[open.length - 1];
    top.close();
  }, true);

  $('#rack-view').addEventListener('click', onRackCellClick);
  $('#dlg-detail').addEventListener('click', onDetailAction);
  $('#place-search').addEventListener('input', renderPlaceList);
  $('#place-list').addEventListener('click', e => {
    const item = e.target.closest('[data-place]');
    if (item) placeWine(item.dataset.place);
  });
  $('#btn-place-new').addEventListener('click', () => {
    pendingPlacement = { ...placeCtx };
    $('#dlg-place').close();
    openWineForm();
  });

  $('#form-wine').addEventListener('submit', onWineSubmit);
  $('#form-wish').addEventListener('submit', onWishSubmit);
  $('#form-rack').addEventListener('submit', onRackSubmit);
  $('#btn-delete-rack').addEventListener('click', deleteRack);
  // Als het wijnformulier sluit (opslaan óf annuleren), vergeten we wat er "klaarstond"
  $('#dlg-wine').addEventListener('close', () => { pendingPlacement = null; pendingWishId = null; });

  $('#import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // Foto en automatisch aanvullen in het wijnformulier
  $('#wine-photo-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      formPhoto = await resizeImage(file);
      renderFormPhoto();
      setAiStatus('Foto toegevoegd. Klik op “Automatisch aanvullen” om de wijn te laten herkennen.');
    } catch (err) {
      alert(err.message);
    }
  });
  $('#btn-photo-remove').addEventListener('click', () => { formPhoto = null; renderFormPhoto(); });
  $('#btn-ai-fill').addEventListener('click', openAiDialog);
  $('#btn-ai-copy').addEventListener('click', copyAiPrompt);
  $('#btn-ai-copy-photo').addEventListener('click', copyAiPhoto);
  $('#btn-ai-apply').addEventListener('click', applyAiAnswer);
  // Zodra je een geel (door Claude ingevuld) veld zelf aanpast, is het niet meer geel
  $('#form-wine').addEventListener('input', e => {
    e.target.classList.remove('ai-filled', 'ai-changed');
    e.target.removeAttribute('title');
    if (['name', 'vintage', 'color', 'imageUrl'].includes(e.target.name)) renderFormBottle();
  });

  // Gaat een ander apparaat iets opslaan terwijl deze app op de achtergrond staat?
  // Dan halen we de nieuwste versie op zodra je hier terugkomt.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !Storage.remote) return;
    if (saving || dirty || $$('dialog[open]').length) return;
    try {
      if (await Storage.hasNewer()) await reloadData();
    } catch {
      // Server even niet bereikbaar: bij de volgende keer opnieuw proberen
    }
  });
  // Waarschuwen als je het venster sluit terwijl er nog iets opgeslagen moet worden
  window.addEventListener('beforeunload', e => {
    if (saving || dirty) e.preventDefault();
  });

  $('#storage-info').textContent = Storage.remote
    ? 'Je gegevens en foto\'s staan op je server, dus je ziet op elk apparaat dezelfde kelder. ' +
      'De server bewaart zelf elke dag een kopie; een back-up downloaden kan altijd nog extra.'
    : 'Je gegevens worden opgeslagen in deze browser. Maak af en toe een back-up, dan raak je nooit iets kwijt.';

  try {
    data = await Storage.load();
  } catch (err) {
    $('#tab-overzicht').innerHTML = `<div class="empty-state card"><h2>De kelder kon niet worden geladen</h2>
      <p>${esc(err.message)} Ververs de pagina om het opnieuw te proberen.</p></div>`;
    return;
  }
  selectedRackId = data.racks[0]?.id ?? null;
  renderAll();

  // Foto's laden duurt even; daarna tekenen we de schermen opnieuw
  Photos.getAll()
    .then(all => { photos = all; renderAll(); })
    .catch(err => console.error('Kon foto\'s niet laden:', err));
}

init();
