// Áudio 100% sintetizado com Web Audio (sem arquivos de som).
// - Música de fundo animada (chiptune/ska, 132 BPM) com bateria, baixo, "stabs" e melodia
// - Fanfarra de vitória e "trombone triste" de derrota
// - Efeitos de acerto, erro, clique e início de partida

const BPM = 132
const STEP_SECONDS = 60 / BPM / 4 // semicolcheia
const LOOKAHEAD_SECONDS = 0.15
const SCHEDULER_INTERVAL_MS = 30

const MASTER_VOLUME = 0.54
const MUSIC_VOLUME = 1
const SFX_VOLUME = 1

let audioContext
let bus
let musicGain
let sfxGain
let noiseBuffer
let schedulerId
let nextStepTime = 0
let stepIndex = 0
let visibilityBound = false

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/* ---------- Partitura ---------- */

// 8 compassos: C | G | Am | F | C | G | F | G
const chordRoots = [48, 43, 45, 41, 48, 43, 41, 43]
const chordStabs = [
  [60, 64, 67],
  [59, 62, 67],
  [57, 60, 64],
  [57, 60, 65],
  [60, 64, 67],
  [59, 62, 67],
  [57, 60, 65],
  [59, 62, 67],
]

// Melodia: [nota MIDI (0 = pausa), duração em semicolcheias]. 8 compassos × 16 = 128 passos.
const melodyNotes = [
  // C
  [79, 2], [76, 2], [79, 2], [84, 4], [83, 2], [79, 2], [0, 2],
  // G
  [81, 2], [79, 2], [86, 2], [83, 4], [81, 2], [79, 2], [0, 2],
  // Am
  [76, 2], [81, 2], [84, 2], [88, 4], [86, 2], [84, 2], [0, 2],
  // F
  [81, 2], [84, 2], [81, 2], [77, 4], [79, 2], [81, 2], [0, 2],
  // C
  [79, 2], [76, 2], [79, 2], [84, 4], [86, 2], [88, 2], [0, 2],
  // G
  [86, 2], [83, 2], [79, 2], [83, 4], [86, 2], [83, 2], [0, 2],
  // F
  [84, 2], [81, 2], [77, 2], [81, 4], [84, 2], [81, 2], [0, 2],
  // G
  [79, 2], [83, 2], [86, 2], [91, 4], [89, 2], [86, 2], [0, 2],
]

const TOTAL_STEPS = 128
const melodyByStep = new Map()
{
  let cursor = 0
  for (const [midi, length] of melodyNotes) {
    if (midi) {
      melodyByStep.set(cursor, { midi, length })
    }
    cursor += length
  }
  if (cursor !== TOTAL_STEPS) {
    throw new Error(`A melodia deve ter ${TOTAL_STEPS} passos, mas tem ${cursor}.`)
  }
}

/* ---------- Infra ---------- */

function createNoiseBuffer(context) {
  const length = context.sampleRate
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1
  }
  return buffer
}

function createBus(context) {
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -16
  compressor.knee.value = 12
  compressor.ratio.value = 6
  compressor.attack.value = 0.004
  compressor.release.value = 0.18

  const master = context.createGain()
  master.gain.value = MASTER_VOLUME

  // Limitador final: deixa o som alto sem estourar/distorcer.
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -4
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.08

  compressor.connect(master)
  master.connect(limiter)
  limiter.connect(context.destination)

  const music = context.createGain()
  music.gain.value = MUSIC_VOLUME
  music.connect(compressor)

  const sfx = context.createGain()
  sfx.gain.value = SFX_VOLUME
  sfx.connect(compressor)

  return { input: compressor, music, sfx }
}

function getAudio() {
  if (typeof window === 'undefined') {
    return null
  }

  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) {
      return null
    }

    audioContext = new AudioContextConstructor()
    bus = createBus(audioContext)
    musicGain = bus.music
    sfxGain = bus.sfx
    noiseBuffer = createNoiseBuffer(audioContext)
  }

  return { context: audioContext, musicGain, sfxGain, noiseBuffer }
}

function resumeAudioContext(context) {
  if (context.state === 'suspended') {
    void context.resume().catch((error) => {
      console.error('Não foi possível iniciar o áudio.', error)
    })
  }
}

function bindVisibility() {
  if (visibilityBound || typeof document === 'undefined') {
    return
  }

  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (!audioContext) {
      return
    }

    if (document.hidden) {
      void audioContext.suspend().catch(() => {})
    } else if (schedulerId) {
      resumeAudioContext(audioContext)
    }
  })
}

/* ---------- Instrumentos ---------- */

function tone(context, destination, {
  frequency,
  start,
  duration,
  type = 'square',
  volume = 0.2,
  attack = 0.008,
  release = 0.06,
  endFrequency,
  filterFrequency,
  detune = 0,
  vibrato = 0,
}) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const stop = start + duration + release

  oscillator.type = type
  oscillator.detune.value = detune
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration)
  }

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + attack)
  gain.gain.setValueAtTime(Math.max(volume, 0.0002), Math.max(start + attack, start + duration - 0.01))
  gain.gain.exponentialRampToValueAtTime(0.0001, stop)

  let output = oscillator
  if (filterFrequency) {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = filterFrequency
    filter.Q.value = 0.8
    oscillator.connect(filter)
    output = filter
  }
  output.connect(gain)
  gain.connect(destination)

  if (vibrato) {
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    lfo.frequency.value = 5.5
    lfoGain.gain.value = vibrato
    lfo.connect(lfoGain)
    lfoGain.connect(oscillator.detune)
    lfo.start(start)
    lfo.stop(stop)
  }

  oscillator.start(start)
  oscillator.stop(stop + 0.02)
}

function noise(context, destination, buffer, {
  start,
  duration,
  volume = 0.2,
  filterType = 'highpass',
  filterFrequency = 6000,
}) {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()

  source.buffer = buffer
  filter.type = filterType
  filter.frequency.value = filterFrequency
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.start(start)
  source.stop(start + duration + 0.02)
}

function kick(context, destination, start) {
  tone(context, destination, {
    frequency: 160,
    endFrequency: 42,
    start,
    duration: 0.16,
    type: 'sine',
    volume: 0.95,
    attack: 0.002,
    release: 0.08,
  })
}

function snare(context, destination, buffer, start) {
  noise(context, destination, buffer, {
    start,
    duration: 0.14,
    volume: 0.5,
    filterType: 'bandpass',
    filterFrequency: 2200,
  })
  tone(context, destination, {
    frequency: 210,
    endFrequency: 120,
    start,
    duration: 0.08,
    type: 'triangle',
    volume: 0.35,
    attack: 0.002,
    release: 0.05,
  })
}

function hat(context, destination, buffer, start, open = false) {
  noise(context, destination, buffer, {
    start,
    duration: open ? 0.16 : 0.04,
    volume: open ? 0.2 : 0.14,
    filterType: 'highpass',
    filterFrequency: 7500,
  })
}

/* ---------- Música de fundo ---------- */

export function scheduleMusicStep(context, destination, buffer, step, time) {
  const bar = Math.floor(step / 16)
  const inBar = step % 16

  // Bateria
  if (inBar % 4 === 0) {
    kick(context, destination, time)
  }
  if (inBar === 10 && bar % 2 === 1) {
    kick(context, destination, time)
  }
  if (inBar === 4 || inBar === 12) {
    snare(context, destination, buffer, time)
  }
  if (step % 8 === 7 && inBar === 15 && bar % 4 === 3) {
    snare(context, destination, buffer, time)
  }
  if (inBar % 2 === 0) {
    hat(context, destination, buffer, time, inBar === 14)
  }

  // Baixo "pula-pula": raiz, oitava, raiz, oitava…
  if (inBar % 2 === 0 && inBar < 12) {
    const root = chordRoots[bar]
    const midi = (inBar / 2) % 2 === 0 ? root : root + 12
    tone(context, destination, {
      frequency: midiToHz(midi),
      start: time,
      duration: STEP_SECONDS * 1.6,
      type: 'sawtooth',
      volume: 0.34,
      attack: 0.004,
      release: 0.05,
      filterFrequency: 700,
    })
  } else if (inBar === 12) {
    tone(context, destination, {
      frequency: midiToHz(chordRoots[bar] + 7),
      start: time,
      duration: STEP_SECONDS * 1.6,
      type: 'sawtooth',
      volume: 0.3,
      attack: 0.004,
      release: 0.05,
      filterFrequency: 700,
    })
  } else if (inBar === 14) {
    tone(context, destination, {
      frequency: midiToHz(chordRoots[bar] + 12),
      start: time,
      duration: STEP_SECONDS * 1.6,
      type: 'sawtooth',
      volume: 0.3,
      attack: 0.004,
      release: 0.05,
      filterFrequency: 700,
    })
  }

  // "Stabs" de acorde no contratempo
  if (inBar % 4 === 2) {
    for (const midi of chordStabs[bar]) {
      tone(context, destination, {
        frequency: midiToHz(midi),
        start: time,
        duration: STEP_SECONDS * 1.2,
        type: 'square',
        volume: 0.07,
        attack: 0.003,
        release: 0.04,
        filterFrequency: 3200,
      })
    }
  }

  // Melodia
  const note = melodyByStep.get(step)
  if (note) {
    const frequency = midiToHz(note.midi)
    const duration = note.length * STEP_SECONDS * 0.92
    tone(context, destination, {
      frequency,
      start: time,
      duration,
      type: 'square',
      volume: 0.17,
      attack: 0.005,
      release: 0.07,
      filterFrequency: 5200,
      vibrato: note.length >= 4 ? 12 : 0,
    })
    tone(context, destination, {
      frequency,
      start: time,
      duration,
      type: 'triangle',
      volume: 0.14,
      attack: 0.005,
      release: 0.07,
      detune: 7,
    })
  }
}

function runScheduler() {
  const audio = getAudio()
  if (!audio) {
    return
  }

  const { context } = audio
  if (nextStepTime < context.currentTime - 0.5) {
    nextStepTime = context.currentTime + 0.05
  }

  while (nextStepTime < context.currentTime + LOOKAHEAD_SECONDS) {
    scheduleMusicStep(context, audio.musicGain, audio.noiseBuffer, stepIndex, nextStepTime)
    nextStepTime += STEP_SECONDS
    stepIndex = (stepIndex + 1) % TOTAL_STEPS
  }
}

export function startBackgroundMusic() {
  if (schedulerId) {
    return
  }

  const audio = getAudio()
  if (!audio) {
    return
  }

  bindVisibility()
  resumeAudioContext(audio.context)
  stepIndex = 0
  nextStepTime = audio.context.currentTime + 0.08
  runScheduler()
  schedulerId = window.setInterval(runScheduler, SCHEDULER_INTERVAL_MS)
}

export function stopBackgroundMusic() {
  if (schedulerId) {
    window.clearInterval(schedulerId)
    schedulerId = undefined
  }
}

// Abaixa a música por alguns segundos para o jingle de vitória/derrota aparecer.
function duckBackgroundMusic(seconds) {
  const audio = getAudio()
  if (!audio || !schedulerId) {
    return
  }

  const now = audio.context.currentTime
  const param = audio.musicGain.gain
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(0.1, now + 0.08)
  param.linearRampToValueAtTime(0.1, now + seconds)
  param.linearRampToValueAtTime(MUSIC_VOLUME, now + seconds + 0.6)

}

/* ---------- Efeitos e jingles ---------- */

export function scheduleWinJingle(context, destination, buffer, start) {
  const hz = midiToHz
  // "Tá-dá-dá-dááá!" em dó maior
  const run = [
    [72, 0, 0.11], [76, 0.11, 0.11], [79, 0.22, 0.11], [84, 0.33, 0.2],
    [79, 0.58, 0.11], [84, 0.69, 0.11], [88, 0.8, 0.9],
  ]
  for (const [midi, offset, length] of run) {
    tone(context, destination, {
      frequency: hz(midi),
      start: start + offset,
      duration: length,
      type: 'square',
      volume: 0.26,
      attack: 0.004,
      release: 0.1,
      filterFrequency: 6000,
      vibrato: length > 0.5 ? 14 : 0,
    })
    tone(context, destination, {
      frequency: hz(midi),
      start: start + offset,
      duration: length,
      type: 'triangle',
      volume: 0.2,
      attack: 0.004,
      release: 0.1,
      detune: 6,
    })
  }

  // Acorde final cheio
  for (const midi of [60, 64, 67, 72, 76]) {
    tone(context, destination, {
      frequency: hz(midi),
      start: start + 0.8,
      duration: 1.1,
      type: 'sawtooth',
      volume: 0.07,
      attack: 0.01,
      release: 0.35,
      filterFrequency: 2400,
    })
  }

  // Brilhos subindo
  ;[96, 100, 103, 108, 100, 103, 108, 112].forEach((midi, index) => {
    tone(context, destination, {
      frequency: hz(midi),
      start: start + 1.0 + index * 0.075,
      duration: 0.08,
      type: 'sine',
      volume: 0.13,
      attack: 0.002,
      release: 0.12,
    })
  })

  kick(context, destination, start)
  kick(context, destination, start + 0.8)
  noise(context, destination, buffer, {
    start: start + 0.8,
    duration: 0.5,
    volume: 0.22,
    filterType: 'highpass',
    filterFrequency: 5000,
  })
}

export function scheduleLoseJingle(context, destination, buffer, start) {
  // "Whaa, whaa, whaa, whaaaaa" — trombone triste
  const slides = [
    [392, 370, 0, 0.36],
    [370, 349.23, 0.4, 0.36],
    [349.23, 329.63, 0.8, 0.36],
    [329.63, 233, 1.2, 1.3],
  ]
  for (const [from, to, offset, length] of slides) {
    const isLast = length > 1
    tone(context, destination, {
      frequency: from,
      endFrequency: to,
      start: start + offset,
      duration: length,
      type: 'sawtooth',
      volume: 0.3,
      attack: 0.04,
      release: 0.12,
      filterFrequency: isLast ? 1300 : 1700,
      vibrato: isLast ? 40 : 0,
    })
    tone(context, destination, {
      frequency: from / 2,
      endFrequency: to / 2,
      start: start + offset,
      duration: length,
      type: 'triangle',
      volume: 0.22,
      attack: 0.04,
      release: 0.12,
    })
  }

  kick(context, destination, start + 1.2)
  noise(context, destination, buffer, {
    start: start + 1.2,
    duration: 0.25,
    volume: 0.12,
    filterType: 'lowpass',
    filterFrequency: 900,
  })
}

function withAudio(callback) {
  const audio = getAudio()
  if (!audio) {
    return
  }

  resumeAudioContext(audio.context)
  callback(audio, audio.context.currentTime + 0.02)
}

export function playSoundEffect() {
  withAudio(({ context, sfxGain }, now) => {
    tone(context, sfxGain, {
      frequency: 880,
      endFrequency: 1320,
      start: now,
      duration: 0.06,
      type: 'square',
      volume: 0.16,
      attack: 0.002,
      release: 0.04,
      filterFrequency: 5000,
    })
  })
}

export function playGameStartSound() {
  withAudio(({ context, sfxGain }, now) => {
    ;[67, 72, 76, 79].forEach((midi, index) => {
      tone(context, sfxGain, {
        frequency: midiToHz(midi),
        start: now + index * 0.07,
        duration: 0.1,
        type: 'square',
        volume: 0.22,
        attack: 0.003,
        release: 0.08,
        filterFrequency: 5000,
      })
    })
  })
}

export function playGuessSound(isCorrect) {
  withAudio(({ context, sfxGain, noiseBuffer: buffer }, now) => {
    if (isCorrect) {
      ;[79, 86].forEach((midi, index) => {
        tone(context, sfxGain, {
          frequency: midiToHz(midi),
          start: now + index * 0.07,
          duration: 0.12,
          type: 'square',
          volume: 0.26,
          attack: 0.003,
          release: 0.1,
          filterFrequency: 6000,
        })
      })
      return
    }

    tone(context, sfxGain, {
      frequency: 220,
      endFrequency: 90,
      start: now,
      duration: 0.22,
      type: 'sawtooth',
      volume: 0.3,
      attack: 0.004,
      release: 0.08,
      filterFrequency: 1400,
    })
    noise(context, sfxGain, buffer, {
      start: now,
      duration: 0.08,
      volume: 0.12,
      filterType: 'lowpass',
      filterFrequency: 1200,
    })
  })
}

export function playRoundEndSound(status) {
  withAudio(({ context, sfxGain, noiseBuffer: buffer }, now) => {
    if (status === 'won') {
      duckBackgroundMusic(2.6)
      scheduleWinJingle(context, sfxGain, buffer, now + 0.05)
      return
    }

    duckBackgroundMusic(3)
    scheduleLoseJingle(context, sfxGain, buffer, now + 0.05)
  })
}

// Usado só nos testes/pré-visualização offline.
export const __audioTesting = {
  TOTAL_STEPS,
  STEP_SECONDS,
  createNoiseBuffer,
  createBus,
}
