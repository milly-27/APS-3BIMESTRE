import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js'

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert']
const VALID_DIFFICULTIES = new Set(DIFFICULTIES)

function getClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase não configurado. Copie .env.example para .env, preencha as variáveis e reinicie o servidor.',
    )
  }

  return getSupabaseClient()
}

export async function saveBestResult({ displayName, difficulty, elapsedSeconds, errors }) {
  if (
    typeof displayName !== 'string'
    || displayName.trim().length < 1
    || displayName.trim().length > 32
  ) {
    throw new TypeError('O nome deve ter de 1 a 32 caracteres.')
  }

  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new TypeError('Nível de dificuldade inválido.')
  }

  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) {
    throw new TypeError('O tempo do resultado é inválido.')
  }

  if (!Number.isInteger(errors) || errors < 0 || errors > 9) {
    throw new TypeError('A quantidade de erros do resultado é inválida.')
  }

  const { data, error } = await getClient().rpc('save_ranking_result', {
    p_display_name: displayName.trim(),
    p_difficulty: difficulty,
    p_elapsed_seconds: elapsedSeconds,
    p_errors: errors,
  })

  if (error) {
    throw new Error(`Não foi possível registrar o resultado: ${error.message}`, { cause: error })
  }

  if (typeof data !== 'boolean') {
    throw new Error('O Supabase não confirmou o registro do resultado.')
  }

  return data
}

export async function getLeaderboard() {
  const client = getClient()
  const entries = await Promise.all(DIFFICULTIES.map(async (difficulty) => {
    const { data, error } = await client
      .from('leaderboard')
      .select('display_name, difficulty, elapsed_seconds, errors, updated_at')
      .eq('difficulty', difficulty)
      .order('elapsed_seconds', { ascending: true })
      .order('errors', { ascending: true })
      .order('updated_at', { ascending: true })
      .limit(10)

    if (error) {
      throw new Error(`Não foi possível carregar o ranking ${difficulty}: ${error.message}`, {
        cause: error,
      })
    }

    return [difficulty, data]
  }))

  return Object.fromEntries(entries)
}
