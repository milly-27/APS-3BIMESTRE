import { DIFFICULTY_RANGES, getDifficultyForWord } from './gameRules.js'

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
  if (typeof random !== 'function') {
    throw new TypeError('O seletor aleatório precisa ser uma função.')
  }

  const value = random()

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('O seletor aleatório deve retornar um valor entre 0 e 1.')
  }

  const words = getWordsForDifficulty(difficulty)
  const selectedWord = words[Math.floor(value * words.length)]

  if (getDifficultyForWord(selectedWord) !== difficulty) {
    throw new Error(`A lista de palavras do nível ${difficulty} contém uma palavra inválida.`)
  }

  return selectedWord
}

export function isSupportedDifficulty(difficulty) {
  return Object.hasOwn(DIFFICULTY_RANGES, difficulty)
}
