let audioContext
let musicInterval
let musicStep = 0

const melody = [
  523.25, null, 659.25, null, 783.99, null, 659.25, null,
  587.33, null, 659.25, null, 783.99, null, 880, null,
  783.99, null, 659.25, null, 523.25, null, 440, null,
  493.88, null, 523.25, null, 392, null, 440, null,
]
const bassLine = [130.81, 164.81, 196, 146.83]

function getAudioContext() {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) {
    return null
  }

  audioContext ??= new AudioContextConstructor()
  return audioContext
}

function resumeAudioContext(context) {
  if (context.state === 'suspended') {
    void context.resume().catch((error) => {
      console.error('Não foi possível iniciar o áudio.', error)
    })
  }
}

function playTone(context, frequency, startAt, duration, waveform, volume) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = waveform
  oscillator.frequency.setValueAtTime(frequency, startAt)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration + 0.02)
}

function playSequence(notes, { interval, duration, waveform = 'triangle', volume = 0.04 }) {
  const context = getAudioContext()
  if (!context) {
    return
  }

  resumeAudioContext(context)
  const startAt = context.currentTime + 0.02
  notes.forEach((frequency, index) => {
    playTone(context, frequency, startAt + index * interval, duration, waveform, volume)
  })
}

export function playSoundEffect() {
  playSequence([740], { interval: 0, duration: 0.07, volume: 0.04 })
}

export function playGameStartSound() {
  playSequence([392, 523.25, 659.25], { interval: 0.08, duration: 0.12, volume: 0.06 })
}

export function playGuessSound(isCorrect) {
  if (isCorrect) {
    playSequence([659.25, 880], { interval: 0.07, duration: 0.1, volume: 0.07 })
    return
  }

  playSequence([196], { interval: 0, duration: 0.18, waveform: 'sawtooth', volume: 0.055 })
}

export function playRoundEndSound(status) {
  if (status === 'won') {
    playSequence([523.25, 659.25, 783.99, 1046.5, 1318.51], {
      interval: 0.1,
      duration: 0.2,
      waveform: 'triangle',
      volume: 0.07,
    })
    return
  }

  playSequence([392, 311.13, 233.08, 196], {
    interval: 0.16,
    duration: 0.3,
    waveform: 'sawtooth',
    volume: 0.06,
  })
}

function playMusicStep(context) {
  const now = context.currentTime + 0.02
  const note = melody[musicStep]

  if (note) {
    playTone(context, note, now, 0.19, 'triangle', 0.025)
  }
  if (musicStep % 4 === 0) {
    const bassNote = bassLine[Math.floor(musicStep / 8) % bassLine.length]
    playTone(context, bassNote, now, 0.32, 'sine', 0.018)
  }

  musicStep = (musicStep + 1) % melody.length
}

export function startBackgroundMusic() {
  if (musicInterval) {
    return
  }

  const context = getAudioContext()
  if (!context) {
    return
  }

  resumeAudioContext(context)
  playMusicStep(context)
  musicInterval = window.setInterval(() => playMusicStep(context), 250)
}

export function stopBackgroundMusic() {
  if (musicInterval) {
    window.clearInterval(musicInterval)
    musicInterval = undefined
  }
}
