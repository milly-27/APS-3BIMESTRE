import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACHIEVEMENTS,
  calculateScore,
  compareResults,
  createRound,
  expireRound,
  getAchievementList,
  getElapsedMilliseconds,
  getDifficultyForWord,
  guessLetter,
  mergeAchievementIds,
  MAX_ERRORS,
  normalizeWord,
} from './gameRules.js'
import {
  chooseDifferentWord,
  chooseWord,
  getWordsForDifficulty,
} from './words.js'

test('normalizes accented letters for comparison without changing display words', () => {
  assert.equal(normalizeWord('ação'), 'ACAO')

  const round = createRound('ação')
  const afterGuess = guessLetter(round, 'c')

  assert.equal(afterGuess.word, 'AÇÃO')
  assert.deepEqual(afterGuess.correctGuesses, ['C'])
  assert.equal(afterGuess.status, 'in_progress')
})

test('expires an active round and leaves finished rounds unchanged', () => {
  const activeRound = createRound('gato')
  const expiredRound = expireRound(activeRound)

  assert.equal(expiredRound.status, 'lost')
  assert.equal(expiredRound.word, activeRound.word)
  assert.equal(expireRound(expiredRound), expiredRound)

  const wonRound = ['g', 'a', 't', 'o'].reduce(
    (round, letter) => guessLetter(round, letter),
    createRound('gato'),
  )
  assert.equal(expireRound(wonRound), wonRound)
})

test('preserves guesses and prevents changes after a round expires', () => {
  const guessedRound = guessLetter(guessLetter(createRound('gato'), 'a'), 'b')
  const expiredRound = expireRound(guessedRound)

  assert.equal(expiredRound.status, 'lost')
  assert.deepEqual(expiredRound.correctGuesses, ['A'])
  assert.deepEqual(expiredRound.incorrectGuesses, ['B'])
  assert.equal(guessLetter(expiredRound, 'g'), expiredRound)
})

test('starts a replay with a fresh round state', () => {
  const finishedRound = expireRound(guessLetter(createRound('gato'), 'b'))
  const replayRound = createRound('casa')

  assert.equal(finishedRound.status, 'lost')
  assert.equal(replayRound.status, 'in_progress')
  assert.equal(replayRound.word, 'CASA')
  assert.deepEqual(replayRound.correctGuesses, [])
  assert.deepEqual(replayRound.incorrectGuesses, [])
  assert.equal(replayRound.maxErrors, MAX_ERRORS)
})

test('calculates elapsed time across pause and resume segments', () => {
  const elapsedWhenPaused = getElapsedMilliseconds({
    elapsedBeforeSegment: 0,
    segmentStartedAt: 1000,
    now: 2250,
  })
  const elapsedAfterResume = getElapsedMilliseconds({
    elapsedBeforeSegment: elapsedWhenPaused,
    segmentStartedAt: 10000,
    now: 11750,
  })

  assert.equal(elapsedWhenPaused, 1250)
  assert.equal(elapsedAfterResume, 3000)
  assert.throws(() => getElapsedMilliseconds({
    elapsedBeforeSegment: 0,
    segmentStartedAt: 10000,
    now: 9999,
  }), TypeError)
})

test('awards achievements according to win, errors, time, and loss', () => {
  assert.deepEqual(
    getAchievementList({ status: 'won', elapsedSeconds: 30, errors: 0 }),
    ACHIEVEMENTS.slice(0, 3),
  )
  assert.deepEqual(
    getAchievementList({ status: 'won', elapsedSeconds: 31, errors: 1 }),
    [ACHIEVEMENTS[0]],
  )
  assert.deepEqual(
    getAchievementList({ status: 'lost', elapsedSeconds: 90, errors: 10 }),
    [ACHIEVEMENTS[3]],
  )
  assert.deepEqual(getAchievementList(null), [])
  assert.throws(() => getAchievementList({ status: 'lost', elapsedSeconds: -1, errors: 0 }), TypeError)
})

test('merges achievement identifiers without duplicates or unknown values', () => {
  assert.deepEqual(
    mergeAchievementIds(['speed', 'unknown', 'victory'], ['victory', 'survivor']),
    ['victory', 'speed', 'survivor'],
  )
  assert.throws(() => mergeAchievementIds(null, []), TypeError)
})

test('classifies word lengths using the agreed difficulty ranges', () => {
  assert.equal(getDifficultyForWord('sol'), 'easy')
  assert.equal(getDifficultyForWord('vento'), 'easy')
  assert.equal(getDifficultyForWord('amigos'), 'medium')
  assert.equal(getDifficultyForWord('computador'), 'hard')
  assert.equal(getDifficultyForWord('extraordinário'), 'expert')
  assert.equal(getDifficultyForWord('independência'), null)
})

test('all curated words match their difficulty and selection stays in range', () => {
  for (const [difficulty, words] of Object.entries({
    easy: getWordsForDifficulty('easy'),
    medium: getWordsForDifficulty('medium'),
    hard: getWordsForDifficulty('hard'),
    expert: getWordsForDifficulty('expert'),
  })) {
    assert.ok(words.length > 0)
    for (const word of words) {
      assert.equal(getDifficultyForWord(word), difficulty)
    }

    assert.equal(chooseWord(difficulty, () => 0), words[0])
    assert.equal(chooseWord(difficulty, () => 0.999999), words.at(-1))
  }
})

test('replay chooses a different word within the same difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
    const words = getWordsForDifficulty(difficulty)
    const nextWord = chooseDifferentWord(difficulty, words[0], () => 0)
    const lastAlternative = chooseDifferentWord(difficulty, words[0], () => 0.999999)

    assert.equal(nextWord, words[1])
    assert.notEqual(nextWord, words[0])
    assert.equal(lastAlternative, words.at(-1))
    assert.equal(getDifficultyForWord(nextWord), difficulty)
  }
})

test('repeated guesses do not count twice and correct guesses reveal every occurrence', () => {
  const firstGuess = guessLetter(createRound('gato'), 'a')

  assert.deepEqual(guessLetter(firstGuess, 'A'), firstGuess)
  assert.deepEqual(
    guessLetter(guessLetter(firstGuess, 'g'), 't').correctGuesses,
    ['A', 'G', 'T'],
  )
})

test('round is won when all distinct letters are guessed', () => {
  let round = createRound('casa')

  for (const letter of ['c', 'a', 's']) {
    round = guessLetter(round, letter)
  }

  assert.equal(round.status, 'won')
})

test('round is lost after the tenth incorrect guess', () => {
  let round = createRound('gato')

  for (const letter of 'bcdefhijkl') {
    round = guessLetter(round, letter)
  }

  assert.equal(MAX_ERRORS, 10)
  assert.equal(round.incorrectGuesses.length, MAX_ERRORS)
  assert.equal(round.status, 'lost')
})

test('finished rounds cannot be changed by later guesses', () => {
  const wonRound = ['g', 'a', 't', 'o'].reduce(
    (round, letter) => guessLetter(round, letter),
    createRound('gato'),
  )

  assert.equal(guessLetter(wonRound, 'z'), wonRound)
})

test('rejects invalid letters, words, error limits, and difficulty names', () => {
  assert.throws(() => createRound(''), TypeError)
  assert.throws(() => createRound('duas palavras'), TypeError)
  assert.throws(() => createRound('gato', 11), RangeError)
  assert.throws(() => guessLetter(createRound('gato'), 'ab'), TypeError)
  assert.throws(() => getWordsForDifficulty('unknown'), RangeError)
  assert.throws(() => chooseWord('easy', () => 1), RangeError)
})

test('compares results by time first and errors only as a tiebreaker', () => {
  assert.ok(compareResults(
    { elapsedSeconds: 30, errors: 9 },
    { elapsedSeconds: 31, errors: 0 },
  ) < 0)
  assert.ok(compareResults(
    { elapsedSeconds: 30, errors: 2 },
    { elapsedSeconds: 30, errors: 3 },
  ) < 0)
  assert.equal(compareResults(
    { elapsedSeconds: 30, errors: 2 },
    { elapsedSeconds: 30, errors: 2 },
  ), 0)
  assert.throws(() => compareResults(
    { elapsedSeconds: -1, errors: 0 },
    { elapsedSeconds: 10, errors: 0 },
  ), TypeError)
})

test('calculates scores from the round result, rewarding wins and penalizing mistakes', () => {
  const winScore = calculateScore({ difficulty: 'easy', elapsedSeconds: 30, errors: 1, won: true })
  const worseWinScore = calculateScore({ difficulty: 'easy', elapsedSeconds: 30, errors: 3, won: true })
  const lossScore = calculateScore({ difficulty: 'hard', elapsedSeconds: 60, errors: 4, won: false })

  assert.ok(winScore > worseWinScore)
  assert.ok(lossScore >= 0)
  assert.ok(winScore > lossScore)
  assert.throws(() => calculateScore({ difficulty: 'easy', elapsedSeconds: -1, errors: 0, won: true }), TypeError)
})
