import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase.js'

const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'expert'])
const INVITE_CODE_PATTERN = /^[A-F0-9]{6}$/
const DISPLAY_NAME_MAX_LENGTH = 32

function getClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase não configurado. Copie .env.example para .env, preencha as variáveis e reinicie o servidor.',
    )
  }

  return getSupabaseClient()
}

function validateDisplayName(displayName) {
  if (
    typeof displayName !== 'string'
    || displayName.trim().length < 1
    || displayName.trim().length > DISPLAY_NAME_MAX_LENGTH
  ) {
    throw new TypeError(`O nome deve ter de 1 a ${DISPLAY_NAME_MAX_LENGTH} caracteres.`)
  }

  return displayName.trim()
}

async function ensurePlayerSession(client) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  if (sessionData.session) {
    return sessionData.session
  }

  const { data, error } = await client.auth.signInAnonymously()

  if (error) {
    throw new Error(
      `Não foi possível iniciar como convidado. Verifique se a autenticação anônima está ativada no Supabase. ${error.message}`,
      { cause: error },
    )
  }

  if (!data.session) {
    throw new Error('O Supabase não retornou uma sessão de jogador.')
  }

  return data.session
}

async function callRoomFunction(functionName, parameters) {
  const client = getClient()
  await ensurePlayerSession(client)

  const { data, error } = await client.rpc(functionName, parameters)

  if (error) {
    throw new Error(`Não foi possível ${functionName === 'create_room' ? 'criar' : 'entrar em'} a sala: ${error.message}`, {
      cause: error,
    })
  }

  const room = Array.isArray(data) ? data[0] : data

  if (!room?.room_id || !room.invite_code) {
    throw new Error('O Supabase não retornou os dados necessários da sala.')
  }

  return room
}

export async function createRoom({ difficulty, displayName }) {
  if (!DIFFICULTIES.has(difficulty)) {
    throw new TypeError('Selecione um nível de dificuldade válido.')
  }

  return callRoomFunction('create_room', {
    p_difficulty: difficulty,
    p_display_name: validateDisplayName(displayName),
  })
}

export async function joinRoom({ inviteCode, displayName }) {
  const normalizedCode = typeof inviteCode === 'string'
    ? inviteCode.trim().toUpperCase()
    : ''

  if (!INVITE_CODE_PATTERN.test(normalizedCode)) {
    throw new TypeError('O código da sala deve ter 6 caracteres hexadecimais (0–9 e A–F).')
  }

  return callRoomFunction('join_room', {
    p_invite_code: normalizedCode,
    p_display_name: validateDisplayName(displayName),
  })
}

export async function startRoom(roomId) {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(roomId)) {
    throw new TypeError('Identificador de sala inválido.')
  }

  const client = getClient()
  await ensurePlayerSession(client)

  const { data, error } = await client.rpc('start_room', { p_room_id: roomId })

  if (error) {
    throw new Error(`Não foi possível iniciar a partida: ${error.message}`, { cause: error })
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.room_id || result.status !== 'in_progress') {
    throw new Error('O Supabase não confirmou o início da partida.')
  }

  return result
}

async function callRoundFunction(functionName, parameters, failureMessage) {
  const client = getClient()
  await ensurePlayerSession(client)
  const { data, error } = await client.rpc(functionName, parameters)

  if (error) {
    throw new Error(`${failureMessage}: ${error.message}`, { cause: error })
  }

  const round = Array.isArray(data) ? data[0] : data
  if (!round?.room_id || !round.status) {
    throw new Error('O Supabase não retornou o estado da rodada.')
  }

  return round
}

export async function getRoundState(roomId) {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(roomId)) {
    throw new TypeError('Identificador de sala inválido.')
  }

  return callRoundFunction(
    'get_round_state',
    { p_room_id: roomId },
    'Não foi possível carregar a rodada',
  )
}

export async function submitGuess(roomId, letter) {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(roomId)) {
    throw new TypeError('Identificador de sala inválido.')
  }

  const normalizedLetter = typeof letter === 'string'
    ? letter.trim().toLocaleUpperCase('pt-BR')
    : ''

  if (!/^[A-Z]$/.test(normalizedLetter.normalize('NFD').replace(/\p{Diacritic}/gu, ''))) {
    throw new TypeError('Informe apenas uma letra.')
  }

  return callRoundFunction(
    'submit_room_guess',
    { p_room_id: roomId, p_letter: normalizedLetter },
    'Não foi possível registrar o palpite',
  )
}

export async function getRoomSnapshot(roomId) {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(roomId)) {
    throw new TypeError('Identificador de sala inválido.')
  }

  const client = getClient()
  await ensurePlayerSession(client)

  const [roomResult, playersResult] = await Promise.all([
    client
      .from('rooms')
      .select('id, invite_code, host_id, difficulty, status, created_at')
      .eq('id', roomId)
      .single(),
    client
      .from('room_players')
      .select('user_id, display_name, joined_at')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true }),
  ])

  if (roomResult.error) {
    throw new Error(`Não foi possível carregar a sala: ${roomResult.error.message}`, {
      cause: roomResult.error,
    })
  }

  if (playersResult.error) {
    throw new Error(`Não foi possível carregar os participantes: ${playersResult.error.message}`, {
      cause: playersResult.error,
    })
  }

  return { room: roomResult.data, players: playersResult.data }
}

export function subscribeToRoom(roomId, {
  onRoomChange,
  onPlayersChange,
  onRoundChange,
  onError,
}) {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(roomId)) {
    throw new TypeError('Identificador de sala inválido.')
  }

  for (const [name, callback] of Object.entries({
    onRoomChange,
    onPlayersChange,
    onRoundChange,
    onError,
  })) {
    if (typeof callback !== 'function') {
      throw new TypeError(`A assinatura da sala exige a função ${name}.`)
    }
  }

  const channel = getClient()
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      onRoomChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      onPlayersChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_round_players',
        filter: `room_id=eq.${roomId}`,
      },
      onRoundChange,
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError(error ?? new Error(`A conexão em tempo real da sala falhou: ${status}.`))
      }
    })

  return () => getClient().removeChannel(channel)
}
