import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const fallbackAppUrl = import.meta.env.VITE_APP_URL
  || import.meta.env.VITE_SUPABASE_REDIRECT_URL
  || 'http://127.0.0.1:5173'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

let supabaseClient

export function getAppUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const { origin, hostname } = window.location

    if (hostname === 'localhost') {
      return origin.replace('://localhost', '://127.0.0.1')
    }

    return origin
  }

  return fallbackAppUrl
}

export function getAuthRedirectUrl(path = '/') {
  return new URL(path, getAppUrl()).toString()
}

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
