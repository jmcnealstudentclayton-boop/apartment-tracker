// js/db.js
// Supabase client + thin wrappers for the two tables we use.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── apartments ───────────────────────────────────────────────

export async function getApartments() {
  const { data, error } = await supabase
    .from('apartments')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getApartment(id) {
  const { data, error } = await supabase
    .from('apartments')
    .select('*, units(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Insert or update by source_url (unique constraint in schema).
// Returns the saved row.
export async function upsertApartment(fields) {
  const { data, error } = await supabase
    .from('apartments')
    .upsert(fields, { onConflict: 'source_url' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteApartment(id) {
  const { error } = await supabase
    .from('apartments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── units ────────────────────────────────────────────────────

// Replace all units for an apartment in one shot.
export async function replaceUnits(apartmentId, units = []) {
  const { error: delErr } = await supabase
    .from('units')
    .delete()
    .eq('apartment_id', apartmentId);
  if (delErr) throw delErr;

  if (units.length === 0) return;

  const rows = units.map(u => ({ ...u, apartment_id: apartmentId }));
  const { error } = await supabase.from('units').insert(rows);
  if (error) throw error;
}
