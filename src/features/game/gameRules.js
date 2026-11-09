export const MAX_ERRORS = 10

export const DIFFICULTY_RANGES = Object.freeze({
  easy: Object.freeze({ min: 3, max: 5 }),
  medium: Object.freeze({ min: 6, max: 8 }),
  hard: Object.freeze({ min: 9, max: 12 }),
  expert: Object.freeze({ min: 14, max: Infinity }),
})

export const DIFFICULTY_LABELS = Object.freeze({
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  expert: 'Muito Difícil',
})

export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'victory', title: 'Vitória', description: 'Conquistou uma rodada.' }),
  Object.freeze({ id: 'perfect', title: 'Sem erros', description: 'Venceu sem errar nenhuma letra.' }),
  Object.freeze({ id: 'speed', title: 'Resposta rápida', description: 'Terminou a rodada em 30 segundos ou menos.' }),
  Object.freeze({ id: 'survivor', title: 'Persistência', description: 'Ainda tentou até o fim da rodada.' }),
])

export function getElapsedMilliseconds({ elapsedBeforeSegment, segmentStartedAt, now }) {
  if (
    !Number.isFinite(elapsedBeforeSegment)
    || elapsedBeforeSegment < 0
    || !Number.isFinite(segmentStartedAt)
    || segmentStartedAt < 0
    || !Number.isFinite(now)
    || now < segmentStartedAt
  ) {
    throw new TypeError('Os horários da partida precisam ser válidos.')
  }

  return Math.floor(elapsedBeforeSegment + now - segmentStartedAt)
}

export function getAchievementList(result) {
  if (result === null || result === undefined) {
    return []
  }

  if (
    !['won', 'lost'].includes(result.status)
    || !Number.isFinite(result.elapsedSeconds)
    || result.elapsedSeconds < 0
    || !Number.isInteger(result.errors)
    || result.errors < 0
    || result.errors > MAX_ERRORS
  ) {
    throw new TypeError('O resultado precisa ter status, tempo e erros válidos para calcular conquistas.')
  }

  const earnedIds = new Set()
  if (result.status === 'won') {
    earnedIds.add('victory')

    if (result.errors === 0) {
      earnedIds.add('perfect')
    }

    if (result.elapsedSeconds <= 30) {
      earnedIds.add('speed')
    }
  } else {
    earnedIds.add('survivor')
  }

  return ACHIEVEMENTS.filter(({ id }) => earnedIds.has(id))
}

export function mergeAchievementIds(existingIds, earnedIds) {
  if (!Array.isArray(existingIds) || !Array.isArray(earnedIds)) {
    throw new TypeError('As conquistas existentes e novas precisam ser listas.')
  }

  const knownIds = new Set(ACHIEVEMENTS.map(({ id }) => id))
  const unlockedIds = new Set(
    [...existingIds, ...earnedIds].filter((id) => knownIds.has(id)),
  )

  return ACHIEVEMENTS
    .filter(({ id }) => unlockedIds.has(id))
    .map(({ id }) => id)
}

export function normalizeWord(word) {
  if (typeof word !== 'string' || word.trim().length === 0) {
    throw new TypeError('A palavra precisa ser um texto não vazio.')
  }

  return word
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleUpperCase('pt-BR')
}

export function getDifficultyForWord(word) {
  const normalized = normalizeWord(word)

  if (!/^[A-Z]+$/.test(normalized)) {
    throw new TypeError('A palavra deve conter apenas letras, sem espaços.')
  }

  const length = normalized.length

  return Object.entries(DIFFICULTY_RANGES).find(([, range]) => (
    length >= range.min && length <= range.max
  ))?.[0] ?? null
}

export function createRound(word, maxErrors = MAX_ERRORS) {
  const normalizedWord = normalizeWord(word)

  if (!/^[A-Z]+$/.test(normalizedWord)) {
    throw new TypeError('A palavra deve conter apenas letras, sem espaços.')
  }

  if (!Number.isInteger(maxErrors) || maxErrors < 1 || maxErrors > MAX_ERRORS) {
    throw new RangeError(`O limite de erros deve estar entre 1 e ${MAX_ERRORS}.`)
  }

  return {
    word: word.trim().toLocaleUpperCase('pt-BR'),
    correctGuesses: [],
    incorrectGuesses: [],
    maxErrors,
    status: 'in_progress',
  }
}

export function guessLetter(round, input) {
  const letter = normalizeWord(input.trim())

  if (!/^[A-Z]$/.test(letter)) {
    throw new TypeError('Informe apenas uma letra.')
  }

  if (round.status !== 'in_progress') {
    return round
  }

  if (round.correctGuesses.includes(letter) || round.incorrectGuesses.includes(letter)) {
    return round
  }

  const normalizedWord = normalizeWord(round.word)

  if (normalizedWord.includes(letter)) {
    const correctGuesses = [...round.correctGuesses, letter]
    const allLettersFound = [...new Set(normalizedWord)].every((wordLetter) => (
      correctGuesses.includes(wordLetter)
    ))

    return {
      ...round,
      correctGuesses,
      status: allLettersFound ? 'won' : 'in_progress',
    }
  }

  const incorrectGuesses = [...round.incorrectGuesses, letter]

  return {
    ...round,
    incorrectGuesses,
    status: incorrectGuesses.length >= round.maxErrors ? 'lost' : 'in_progress',
  }
}

export function expireRound(round) {
  if (round.status !== 'in_progress') {
    return round
  }

  return { ...round, status: 'lost' }
}

export function calculateScore({ difficulty, elapsedSeconds, errors, won }) {
  if (!Object.hasOwn(DIFFICULTY_RANGES, difficulty)) {
    throw new TypeError('Selecione um nível de dificuldade válido.')
  }

  if (
    !Number.isFinite(elapsedSeconds)
    || elapsedSeconds < 0
    || !Number.isInteger(errors)
    || errors < 0
    || errors > MAX_ERRORS
    || typeof won !== 'boolean'
  ) {
    throw new TypeError('O resultado da rodada precisa ter tempo, erros e vitória válidos.')
  }

  const difficultyBase = {
    easy: 120,
    medium: 155,
    hard: 200,
    expert: 245,
  }

  const timeBonus = Math.max(0, 120 - elapsedSeconds)
  const resultBonus = won ? 150 : 0
  const errorPenalty = errors * 15

  return Math.max(0, difficultyBase[difficulty] + timeBonus + resultBonus - errorPenalty)
}

export function compareResults(first, second) {
  for (const result of [first, second]) {
    if (
      !Number.isFinite(result?.elapsedSeconds)
      || result.elapsedSeconds < 0
      || !Number.isInteger(result?.errors)
      || result.errors < 0
      || result.errors > MAX_ERRORS
    ) {
      throw new TypeError('O resultado precisa ter tempo e número de erros válidos.')
    }
  }

  return first.elapsedSeconds - second.elapsedSeconds || first.errors - second.errors
}
