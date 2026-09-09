/* ==========================================================================
   api.js — elige el backend (Supabase real o demo local)
   ========================================================================== */

import { CFG } from './util.js';
import { makeDemoBackend } from './backend/demo.js';
import { makeSupabaseBackend } from './backend/supabase.js';

export let api = null;

const DEMO_FLAG = 'eq_boards_force_demo';

export const configurado = () => Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
export const demoForzado = () => localStorage.getItem(DEMO_FLAG) === '1';
export const activarDemo = () => localStorage.setItem(DEMO_FLAG, '1');
export const salirDemo = () => localStorage.removeItem(DEMO_FLAG);

/** Inicializa el backend. Devuelve 'demo' | 'supabase'. */
export async function initApi() {
  if (!configurado() || demoForzado()) {
    api = makeDemoBackend();
    return 'demo';
  }
  api = await makeSupabaseBackend();
  return 'supabase';
}
