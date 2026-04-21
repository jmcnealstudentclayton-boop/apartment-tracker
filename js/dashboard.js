// js/dashboard.js
// Handles: apartment list rendering, URL import flow, per-card refresh/delete.

import { getApartments, upsertApartment, deleteApartment } from './db.js';
import { FETCH_FN_URL, SUPABASE_ANON_KEY } from './config.js';

// ─── Init ─────────────────────────────────────────────────────

document.getElementById('import-form').addEventListener('submit', handleFetch);
loadDashboard();

// ─── Dashboard load + render ──────────────────────────────────

async function loadDashboard() {
  const list = document.getElementById('apartment-list');
  list.innerHTML = '<p class="text-slate-400 text-sm col-span-full">Loading…</p>';
  try {
    const apartments = await getApartments();
    renderList(apartments);
  } catch (e) {
    list.innerHTML = `<p class="text-red-400 text-sm col-span-full">Error loading apartments: ${esc(e.message)}</p>`;
  }
}

function renderList(apartments) {
  const list = document.getElementById('apartment-list');
  if (!apartments.length) {
    list.innerHTML =
      '<p class="text-slate-500 text-sm col-span-full">No apartments saved yet. Paste a URL above to get started.</p>';
    return;
  }

  list.innerHTML = apartments.map(renderCard).join('');

  apartments.forEach(apt => {
    document.getElementById(`btn-refresh-${apt.id}`)
      ?.addEventListener('click', () => refreshCard(apt));
    document.getElementById(`btn-delete-${apt.id}`)
      ?.addEventListener('click', () => confirmDelete(apt));
  });
}

function renderCard(apt) {
  const name     = apt.property_name || apt.source_domain || 'Unnamed';
  const location = [apt.city, apt.state].filter(Boolean).join(', ') || apt.address_line1 || '—';
  const updated  = apt.updated_at
    ? new Date(apt.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'never';

  return `
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">

      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <a href="apartment.html?id=${apt.id}"
             class="text-blue-400 hover:text-blue-300 font-medium text-base leading-snug block truncate"
             title="${escAttr(name)}">${esc(name)}</a>
          <span class="text-slate-500 text-xs">${esc(apt.source_domain || '')}</span>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button id="btn-refresh-${apt.id}"
                  class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1 rounded">
            ↻ Refresh
          </button>
          <button id="btn-delete-${apt.id}"
                  class="text-xs bg-slate-700 hover:bg-red-900/60 text-slate-400 hover:text-red-300 px-2 py-1 rounded">
            ✕
          </button>
        </div>
      </div>

      <dl class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        ${cardField('Location', location)}
        ${cardField('Rent', apt.rent_summary_text)}
        ${cardField('Sqft', apt.sqft_summary_text)}
        ${cardField('Availability', apt.availability_summary_text)}
      </dl>

      <p class="text-slate-600 text-xs">Updated ${updated}</p>
    </div>
  `;
}

function cardField(label, value) {
  return `
    <div>
      <dt class="text-slate-500 text-xs uppercase tracking-wide">${label}</dt>
      <dd class="text-slate-300 mt-0.5 leading-snug">${esc(value || '—')}</dd>
    </div>`;
}

// ─── Refresh a single card ────────────────────────────────────

async function refreshCard(apt) {
  const btn = document.getElementById(`btn-refresh-${apt.id}`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    const data = await callFetchFn(apt.source_url);
    await upsertApartment(data);
    await loadDashboard();
  } catch (e) {
    alert(`Refresh failed: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
  }
}

// ─── Delete ───────────────────────────────────────────────────

async function confirmDelete(apt) {
  const label = apt.property_name || apt.source_domain || 'this apartment';
  if (!confirm(`Delete "${label}"?`)) return;
  try {
    await deleteApartment(apt.id);
    await loadDashboard();
  } catch (e) {
    alert(`Delete failed: ${e.message}`);
  }
}

// ─── Import / fetch flow ──────────────────────────────────────

let pendingData = null; // holds parsed data until confirmed

async function handleFetch(e) {
  e.preventDefault();

  const urlInput   = document.getElementById('url-input');
  const fetchBtn   = document.getElementById('fetch-btn');
  const previewWrap = document.getElementById('preview-panel');
  const urlValue   = urlInput.value.trim();

  if (!urlValue) return;

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching…';
  previewWrap.classList.add('hidden');
  previewWrap.innerHTML = '';

  try {
    pendingData = await callFetchFn(urlValue);
    showPreview(pendingData, previewWrap);
  } catch (err) {
    previewWrap.innerHTML = `<p class="text-red-400 text-sm mt-2">${esc(err.message)}</p>`;
    previewWrap.classList.remove('hidden');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch';
  }
}

function showPreview(data, container) {
  const FIELDS = [
    ['property_name',             'Property Name'],
    ['address_line1',             'Address'],
    ['city',                      'City'],
    ['state',                     'State'],
    ['zip',                       'ZIP'],
    ['phone',                     'Phone'],
    ['rent_summary_text',         'Rent'],
    ['sqft_summary_text',         'Sqft'],
    ['availability_summary_text', 'Availability'],
  ];

  const rows = FIELDS.map(([key, label]) => `
    <div class="flex items-start gap-3">
      <label for="pv-${key}" class="text-xs text-slate-400 w-32 shrink-0 pt-1.5">${label}</label>
      <input id="pv-${key}" type="text" value="${escAttr(data[key] || '')}"
             class="flex-1 bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-slate-100
                    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40" />
    </div>`).join('');

  container.innerHTML = `
    <div class="mt-3 bg-slate-800 border border-slate-600 rounded-lg p-4 space-y-3">
      <p class="text-sm text-slate-300 font-medium">
        Review extracted data
        <span class="text-slate-500 font-normal">— edit any fields before saving</span>
      </p>
      <div class="space-y-2">${rows}</div>
      <div class="flex gap-2 pt-1">
        <button id="confirm-save"
                class="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded font-medium">
          Save Apartment
        </button>
        <button id="cancel-preview"
                class="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
      <p id="save-status" class="text-xs"></p>
    </div>`;

  container.classList.remove('hidden');
  document.getElementById('confirm-save').addEventListener('click', handleSave);
  document.getElementById('cancel-preview').addEventListener('click', () => {
    container.classList.add('hidden');
    pendingData = null;
  });
}

async function handleSave() {
  if (!pendingData) return;

  const saveBtn = document.getElementById('confirm-save');
  const status  = document.getElementById('save-status');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  // Merge any edits the user made in the preview inputs
  const EDITABLE = ['property_name', 'address_line1', 'city', 'state', 'zip', 'phone',
                    'rent_summary_text', 'sqft_summary_text', 'availability_summary_text'];
  const payload = { ...pendingData };
  EDITABLE.forEach(key => {
    const el = document.getElementById(`pv-${key}`);
    if (el) payload[key] = el.value;
  });

  try {
    await upsertApartment(payload);
    document.getElementById('preview-panel').classList.add('hidden');
    document.getElementById('url-input').value = '';
    pendingData = null;
    await loadDashboard();
  } catch (err) {
    status.textContent = `Save failed: ${err.message}`;
    status.className = 'text-xs text-red-400';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Apartment';
  }
}

// ─── Edge Function caller ─────────────────────────────────────

async function callFetchFn(url) {
  const res = await fetch(FETCH_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ url }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

// ─── Escape helpers ───────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
