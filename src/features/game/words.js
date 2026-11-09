import { DIFFICULTY_RANGES, getDifficultyForWord, normalizeWord } from './gameRules.js'

export const WORDS_BY_DIFFICULTY = Object.freeze({
  easy: Object.freeze([
    'sol',
    'rio',
    'lua',
    'gato',
    'bola',
    'casa',
    'jogo',
    'vento',
    'livro',
  ]),
  medium: Object.freeze([
    'amigos',
    'escola',
    'janela',
    'viagem',
    'palavra',
    'jogador',
    'teclado',
    'planeta',
  ]),
  hard: Object.freeze([
    'biblioteca',
    'computador',
    'laboratório',
    'pensamento',
    'experiência',
    'astronauta',
    'formigueiro',
    'personagem',
  ]),
  expert: Object.freeze([
    'extraordinário',
    'sustentabilidade',
    'interatividade',
    'biodiversidade',
    'desenvolvimento',
    'multiprocessador',
    'anticonstitucional',
    'interdisciplinaridade',
  ]),
})

export function getWordsForDifficulty(difficulty) {
  const words = WORDS_BY_DIFFICULTY[difficulty]

  if (!words) {
    throw new RangeError(`Nível de dificuldade inválido: ${difficulty}`)
  }

  return words
}

export function chooseWord(difficulty, random = Math.random) {
  const words = getWordsForDifficulty(difficulty)
  return chooseWordFromList(difficulty, words, random)
}

export function chooseDifferentWord(difficulty, previousWord, random = Math.random) {
  const previousNormalizedWord = normalizeWord(previousWord)
  const words = getWordsForDifficulty(difficulty)
  const alternativeWords = words.filter((word) => normalizeWord(word) !== previousNormalizedWord)

  return chooseWordFromList(
    difficulty,
    alternativeWords.length > 0 ? alternativeWords : words,
    random,
  )
}

function chooseWordFromList(difficulty, words, random) {
  if (typeof random !== 'function') {
    throw new TypeError('O seletor aleatório precisa ser uma função.')
  }

  const value = random()

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('O seletor aleatório deve retornar um valor entre 0 e 1.')
  }

  const selectedWord = words[Math.floor(value * words.length)]

  if (getDifficultyForWord(selectedWord) !== difficulty) {
    throw new Error(`A lista de palavras do nível ${difficulty} contém uma palavra inválida.`)
  }

  return selectedWord
}

export function isSupportedDifficulty(difficulty) {
  return Object.hasOwn(DIFFICULTY_RANGES, difficulty)
}
