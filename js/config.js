// This file is overwritten by the GitHub Actions deploy workflow.
// Do NOT put real credentials here — set them in GitHub repo Secrets.
export const SUPABASE_URL      = '';
export const SUPABASE_ANON_KEY = '';
export const FETCH_FN_URL      = SUPABASE_URL + '/functions/v1/fetch-apartment';
