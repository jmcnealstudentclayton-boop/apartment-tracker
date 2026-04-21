// js/detail.js
// Handles: apartment detail page, units table, refresh.

import { getApartment, upsertApartment } from './db.js';
import { FETCH_FN_URL, SUPABASE_ANON_KEY } from './config.js';

const params = new URLSearchParams(location.search);
const aptId  = params.get('id');

loadDetail();
document.getElementById('refresh-btn').addEventListener('click', handleRefresh);

// ─── Load ─────────────────────────────────────────────────────

async function loadDetail() {
  const content = document.getElementById('content');
  content.innerHTML = '<p class="text-slate-400 text-sm">Loading…</p>';

  if (!aptId) {
    content.innerHTML = '<p class="text-red-400 text-sm">No apartment ID in URL.</p>';
    return;
  }

  try {
    const apt = await getApartment(aptId);
    document.title = apt.property_name || apt.source_domain || 'Apartment';
    renderDetail(apt);
  } catch (e) {
    content.innerHTML = `<p class="text-red-400 text-sm">Error: ${esc(e.message)}</p>`;
  }
}

// ─── Render ───────────────────────────────────────────────────

function renderDetail(apt) {
  const content = document.getElementById('content');
  const fetched = apt.last_fetched_at ? fmtDatetime(apt.last_fetched_at) : 'never';
  const updated = apt.updated_at      ? fmtDatetime(apt.updated_at)      : 'never';

  const infoFields = [
    ['Property',      apt.property_name],
    ['Address',       [apt.address_line1, apt.city, apt.state, apt.zip].filter(Boolean).join(', ')],
    ['Phone',         apt.phone],
    ['Rent',          apt.rent_summary_text],
    ['Sqft',          apt.sqft_summary_text],
    ['Availability',  apt.availability_summary_text],
    ['Source domain', apt.source_domain],
    ['Source URL',    apt.source_url],
    ['Official URL',  apt.official_url],
    ['Last fetched',  fetched],
    ['Last updated',  updated],
  ].filter(([, v]) => v);

  const infoRows = infoFields.map(([label, value]) => {
    const isUrl = typeof value === 'string' && value.startsWith('http');
    const display = isUrl
      ? `<a href="${escAttr(value)}" target="_blank" rel="noopener noreferrer"
            class="text-blue-400 hover:underline break-all">${esc(value)}</a>`
      : `<span class="text-slate-200 break-words">${esc(value)}</span>`;
    return `
      <div class="flex gap-4 py-2.5 border-b border-slate-700/60 last:border-0">
        <span class="text-slate-500 text-xs w-28 shrink-0 pt-0.5 uppercase tracking-wide">${esc(label)}</span>
        <div class="text-sm flex-1">${display}</div>
      </div>`;
  }).join('');

  const unitsSection = apt.units?.length
    ? renderUnitsTable(apt.units)
    : '<p class="text-slate-500 text-sm">No unit data extracted.</p>';

  const rawSection = apt.raw_text ? `
    <section class="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h2 class="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Raw Extracted Text</h2>
      <pre class="text-xs text-slate-500 bg-slate-900 border border-slate-700 rounded p-3
                  overflow-auto max-h-52 whitespace-pre-wrap leading-relaxed">${esc(apt.raw_text.slice(0, 2000))}</pre>
    </section>` : '';

  content.innerHTML = `
    <div class="space-y-5">

      <section class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 class="text-base font-semibold text-slate-100 mb-1">
          ${esc(apt.property_name || apt.source_domain || 'Apartment')}
        </h2>
        <div>${infoRows}</div>
      </section>

      <section class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 class="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Units / Floorplans</h2>
        ${unitsSection}
      </section>

      ${rawSection}

    </div>`;
}

function renderUnitsTable(units) {
  const rows = units.map(u => `
    <tr class="border-b border-slate-700/60 last:border-0">
      <td class="py-2.5 pr-4 text-sm text-slate-200">${esc(u.floorplan_name || '—')}</td>
      <td class="py-2.5 pr-4 text-sm text-slate-300 whitespace-nowrap">${fmtBedBath(u.bedrooms, u.bathrooms)}</td>
      <td class="py-2.5 pr-4 text-sm text-slate-300 whitespace-nowrap">${fmtRent(u.rent_min, u.rent_max)}</td>
      <td class="py-2.5 pr-4 text-sm text-slate-300 whitespace-nowrap">${fmtSqft(u.sqft_min, u.sqft_max)}</td>
      <td class="py-2.5 text-sm text-slate-400">${esc(u.availability_status || '—')}</td>
    </tr>`).join('');

  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-slate-600">
            <th class="pb-2 text-xs text-slate-500 font-normal pr-4">Floorplan</th>
            <th class="pb-2 text-xs text-slate-500 font-normal pr-4">Bed / Bath</th>
            <th class="pb-2 text-xs text-slate-500 font-normal pr-4">Rent</th>
            <th class="pb-2 text-xs text-slate-500 font-normal pr-4">Sqft</th>
            <th class="pb-2 text-xs text-slate-500 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Refresh ──────────────────────────────────────────────────

async function handleRefresh() {
  if (!aptId) return;
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';

  try {
    // Need the source URL — it's already loaded on first render, but let's re-fetch cheaply
    const apt = await getApartment(aptId);
    const res = await fetch(FETCH_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ url: apt.source_url }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    await upsertApartment(json.data);
    await loadDetail();
  } catch (e) {
    alert(`Refresh failed: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Refresh';
  }
}

// ─── Format helpers ───────────────────────────────────────────

function fmtBedBath(beds, baths) {
  if (beds == null && baths == null) return '—';
  return [beds != null ? `${beds} bd` : '', baths != null ? `${baths} ba` : '']
    .filter(Boolean).join(' / ');
}

function fmtRent(min, max) {
  if (!min && !max) return '—';
  const fmt = n => '$' + Number(n).toLocaleString();
  return (min && max && min !== max) ? `${fmt(min)} – ${fmt(max)}` : fmt(min || max);
}

function fmtSqft(min, max) {
  if (!min && !max) return '—';
  const fmt = n => Number(n).toLocaleString();
  return (min && max && min !== max) ? `${fmt(min)} – ${fmt(max)} sqft` : `${fmt(min || max)} sqft`;
}

function fmtDatetime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

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
