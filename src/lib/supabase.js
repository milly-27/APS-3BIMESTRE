import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

let supabaseClient

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase não configurado. Copie .env.example para .env, preencha a URL do projeto e a chave publicável, e reinicie o servidor.',
    )
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey)
  }

  return supabaseClient
}
