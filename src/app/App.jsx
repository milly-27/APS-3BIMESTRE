import { useEffect, useRef, useState } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  loginSchema,
  signUpSchema,
  AuthProvider,
  useAuth,
} from '../features/auth/AuthContext.jsx'
import {
  createRoom,
  getRoundState,
  getRoomSnapshot,
  joinRoom,
  subscribeToRoom,
  startRoom,
  submitGuess,
} from '../features/rooms/roomService.js'
import {
  getLeaderboard,
  saveBestResult,
  saveRoomResult,
} from '../features/ranking/rankingService.js'
import {
  createSoloRound,
  guessLetter,
  MAX_ERRORS,
  normalizeWord,
} from '../features/game/gameRules.js'
import { gameModeOptions } from '../features/game/gameModes.js'
import {
  playGameStartSound,
  playGuessSound,
  playRoundEndSound,
  playSoundEffect,
  startBackgroundMusic,
  stopBackgroundMusic,
} from '../features/settings/audio.js'
import SceneDecor from './SceneDecor.jsx'
import './App.css'

const settingsStorageKey = 'forca-settings'
const defaultSettings = {
  soundEffects: true,
  backgroundMusic: true,
  theme: 'purple',
}
const themeOptions = [
  { value: 'purple', label: 'Cristais', color: 'radial-gradient(circle at 30% 70%, #b685ff, transparent 55%), radial-gradient(circle at 75% 30%, #f29bc6, transparent 50%), #12301f' },
  { value: 'light', label: 'Clareira', color: 'radial-gradient(circle at 50% 0%, #ffe082, transparent 60%), linear-gradient(180deg, #4d9a55, #1f5a2e)' },
  { value: 'ember', label: 'Lanternas', color: 'radial-gradient(circle at 50% 75%, #ff9a3c, transparent 60%), #3a2412' },
  { value: 'moon', label: 'Luar', color: 'radial-gradient(circle at 70% 25%, #dbe6ff, transparent 22%), linear-gradient(180deg, #1c2e55, #0a1226)' },
]

const difficulties = [
  { value: 'easy', label: 'Fácil', detail: '3 a 5 letras' },
  { value: 'medium', label: 'Médio', detail: '6 a 8 letras' },
  { value: 'hard', label: 'Difícil', detail: '9 a 12 letras' },
  { value: 'expert', label: 'Expert', detail: '14 letras ou mais' },
]

function DifficultyIcon({ value }) {
  return (
    <svg className="diff-icon" viewBox="0 0 48 48" aria-hidden="true">
      {value === 'easy' && (
        <g>
          <path d="M8 38C8 16 22 8 40 8c0 22-10 32-30 32Z" fill="#6fae45" stroke="#1d3a17" strokeWidth="2" />
          <path d="M10 38C18 28 26 20 36 12" fill="none" stroke="#1d3a17" strokeWidth="2" />
        </g>
      )}
      {value === 'medium' && (
        <g>
          <rect x="19" y="24" width="10" height="16" rx="4" fill="#f0e2c0" />
          <path d="M5 28C5 8 43 8 43 28c0 3-8 4-19 4S5 31 5 28Z" fill="#c8405f" stroke="#4a1220" strokeWidth="2" />
          <circle cx="16" cy="19" r="3" fill="#fff6dd" /><circle cx="30" cy="15" r="2.5" fill="#fff6dd" /><circle cx="36" cy="23" r="2" fill="#fff6dd" />
        </g>
      )}
      {value === 'hard' && (
        <g>
          <path d="M24 4 36 18 28 44H20L12 18Z" fill="#a46cf0" stroke="#3b1f6e" strokeWidth="2" strokeLinejoin="round" />
          <path d="M24 4 36 18 28 44 24 20Z" fill="#ffffff44" />
        </g>
      )}
      {value === 'expert' && (
        <g>
          <path d="M24 3c3 9 14 13 14 26a14 14 0 0 1-28 0c0-6 3-9 6-12 0 5 3 7 5 7 1-9-1-14 3-21Z" fill="#ff8a3c" stroke="#5a1f0a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M24 24c2 5 6 7 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 2Z" fill="#ffd37a" />
        </g>
      )}
    </svg>
  )
}

function CaveMouth() {
  return (
    <div className="cave-mouth" aria-hidden="true">
      <svg viewBox="0 0 400 230">
        <defs>
          <radialGradient id="cave-glow" cx="50%" cy="90%" r="75%">
            <stop offset="0" stopColor="#ffd37a" />
            <stop offset=".4" stopColor="#ff9a3c" />
            <stop offset="1" stopColor="#2a1208" />
          </radialGradient>
        </defs>
        <path d="M10 230V120C10 40 90 6 200 6s190 34 190 114v110Z" fill="#5d4a3c" stroke="#1e110a" strokeWidth="5" />
        <path d="M30 120 52 96M350 100l20 22M120 30l14 18M270 26l-12 20M70 60l16 6M330 58l-18 6" stroke="#3b2d23" strokeWidth="4" strokeLinecap="round" />
        <path d="M44 230V126C44 66 108 36 200 36s156 30 156 90v104Z" fill="url(#cave-glow)" stroke="#1e110a" strokeWidth="4" />
        <g className="cave-fire">
          <path d="M200 230c-38-6-46-40-24-66 4 14 14 18 20 8 2-24 22-40 22-40 2 24 30 36 20 70-6 16-20 24-38 28Z" fill="#ffe7a0" opacity=".9" />
        </g>
        <path d="M14 124C14 44 92 10 200 10s186 34 186 114" fill="none" stroke="#3f7a35" strokeWidth="9" strokeDasharray="22 6" strokeLinecap="round" />
        {[[40, 84, '#f29bc6'], [78, 48, '#c9a2ff'], [150, 20, '#f29bc6'], [250, 18, '#c9a2ff'], [322, 50, '#f29bc6'], [362, 88, '#ffd978']].map(([x, y, c]) => (
          <g key={x} transform={`translate(${x} ${y})`}>
            {[0, 72, 144, 216, 288].map((a) => <ellipse cx="0" cy="-6" fill={c} key={a} rx="4" ry="6.5" transform={`rotate(${a})`} />)}
            <circle r="3" fill="#fff3b0" />
          </g>
        ))}
      </svg>
    </div>
  )
}

function formatElapsedTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function RankingPage() {
  const [entries, setEntries] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    getLeaderboard()
      .then((results) => {
        if (active) {
          setEntries(results)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || 'Não foi possível carregar o ranking.')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <section className="page-card ranking-page" aria-labelledby="ranking-title">
      <p className="eyebrow">Melhores resultados</p>
      <h1 id="ranking-title">Ranking</h1>
      <p className="page-description">
        Os 10 melhores recordes de cada dificuldade, ordenados pelo menor tempo e, em caso de empate, por menos erros.
      </p>
      {isLoading && <p className="page-description" aria-live="polite">Carregando ranking...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!isLoading && !error && entries && difficulties.every(({ value }) => entries[value].length === 0) && (
        <p className="page-description">Ainda não há resultados registrados. Seja o primeiro!</p>
      )}
      {!isLoading && !error && entries && difficulties.some(({ value }) => entries[value].length > 0) && (
        <div className="ranking-groups">
          {difficulties.map(({ value, label }) => (
            <section className="ranking-group" key={value} aria-labelledby={`ranking-${value}`}>
              <h2 id={`ranking-${value}`}>{label}</h2>
              {entries[value].length === 0 ? (
                <p className="ranking-empty">Ainda sem recordes neste nível.</p>
              ) : (
                <ol className="ranking-list" aria-label={`Dez melhores resultados: ${label}`}>
                  {entries[value].map((entry, index) => (
                    <li className="ranking-row" key={`${entry.display_name}-${entry.updated_at}-${index}`}>
                      <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                      <strong>{entry.display_name}</strong>
                      <span className="ranking-score">
                        {formatElapsedTime(entry.elapsed_seconds)}
                        {' · '}
                        {entry.errors} {entry.errors === 1 ? 'erro' : 'erros'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function getRegisteredDisplayName(session) {
  const user = session?.user
  const fromMetadata = user?.user_metadata?.display_name
  const fromEmail = user?.email?.split('@')[0]
  return String(fromMetadata || fromEmail || 'Jogador').trim().slice(0, 32) || 'Jogador'
}

// Envia ao Supabase a vitória pendente (solo ou sala) assim que a pessoa estiver logada.
function useScoreRegistration() {
  const { pendingScore, session, setPendingScore } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const savingRef = useRef(null)
  const isRegisteredUser = Boolean(session?.user && !session.user.is_anonymous)
  const displayName = getRegisteredDisplayName(session)

  useEffect(() => {
    if (!pendingScore || pendingScore.status !== 'won' || pendingScore.saved || !isRegisteredUser) {
      return
    }

    if (savingRef.current === pendingScore) {
      return
    }

    const score = pendingScore
    savingRef.current = score
    setIsSaving(true)
    setError('')

    const payload = {
      displayName,
      difficulty: score.difficulty,
      elapsedSeconds: score.elapsedSeconds,
      errors: score.errors,
    }
    const request = score.roomId
      ? saveRoomResult({ roomId: score.roomId, ...payload })
      : saveBestResult(payload)

    request
      .then((isNewRecord) => {
        setPendingScore((current) => (
          current === score ? { ...score, saved: true, isNewRecord } : current
        ))
      })
      .catch((requestError) => {
        console.error('Falha ao registrar resultado no ranking.', requestError)
        setError(requestError.message || 'Não foi possível registrar o resultado.')
      })
      .finally(() => setIsSaving(false))
  }, [attempt, displayName, isRegisteredUser, pendingScore, setPendingScore])

  function retry() {
    savingRef.current = null
    setError('')
    setAttempt((current) => current + 1)
  }

  const notice = pendingScore?.saved
    ? pendingScore.isNewRecord
      ? 'Resultado registrado. Seu recorde foi atualizado!'
      : 'Resultado recebido. Seu recorde anterior continua valendo.'
    : ''

  return { error, isRegisteredUser, isSaving, notice, pendingScore, retry }
}

function RankingStatus({ registration }) {
  const { error, isRegisteredUser, isSaving, notice, retry } = registration

  if (!isRegisteredUser) {
    return (
      <span className="ranking-status">
        Quer entrar no ranking? <Link to="/login">Entre ou crie uma conta</Link>.
      </span>
    )
  }

  if (isSaving) {
    return <span className="ranking-status" aria-live="polite">Salvando no ranking…</span>
  }

  if (error) {
    return (
      <span className="ranking-status ranking-status-error" role="alert">
        {error}{' '}
        <button className="text-button" onClick={retry} type="button">Tentar de novo</button>
      </span>
    )
  }

  if (notice) {
    return <span className="ranking-status ranking-status-ok" role="status">🏆 {notice}</span>
  }

  return null
}

function ResultPage() {
  const registration = useScoreRegistration()
  const { error, isRegisteredUser, isSaving, notice, pendingScore, retry } = registration

  return (
    <section className={`page-card result-card ${pendingScore?.status ?? ''}`} aria-labelledby="result-title">
      <p className="eyebrow">Resultado da partida</p>
      <h1 id="result-title">{pendingScore?.status === 'won' ? 'Você venceu!' : 'Fim da partida'}</h1>
      {!pendingScore && (
        <p className="page-description">Não há um resultado pendente para registrar.</p>
      )}
      {pendingScore && (
        <p className="page-description">
          Tempo: {formatElapsedTime(pendingScore.elapsedSeconds)}
          {' · '}
          Erros: {pendingScore.errors}
          {' · '}
          {difficulties.find(({ value }) => value === pendingScore.difficulty)?.label ?? pendingScore.difficulty}
        </p>
      )}
      {pendingScore?.status === 'lost' && (
        <p className="page-description">Partidas perdidas não entram no ranking de recordes.</p>
      )}
      {pendingScore?.status === 'won' && !isRegisteredUser && (
        <div>
          <p className="page-description">Entre ou crie uma conta para registrar sua vitória no ranking.</p>
          <Link className="button button-primary" to="/login">Entrar para registrar</Link>
        </div>
      )}
      {isSaving && <p className="page-description" aria-live="polite">Registrando resultado...</p>}
      {notice && <p className="feature-notice" role="status">{notice}</p>}
      {error && (
        <div>
          <p className="form-error" role="alert">{error}</p>
          <button className="button button-secondary" onClick={retry} type="button">Tentar de novo</button>
        </div>
      )}
      <div className="home-actions">
        <Link className="button button-primary" to="/ranking">Ver ranking</Link>
        <Link className="button button-secondary" to="/">Jogar de novo</Link>
      </div>
    </section>
  )
}

function loadSettings() {
  const savedSettings = window.localStorage.getItem(settingsStorageKey)
  if (!savedSettings) {
    return defaultSettings
  }

  let parsedSettings
  try {
    parsedSettings = JSON.parse(savedSettings)
  } catch (error) {
    console.error('As configurações salvas não puderam ser lidas.', error)
    return defaultSettings
  }

  if (parsedSettings?.theme === 'dark') {
    parsedSettings = { ...parsedSettings, theme: 'purple' }
  }

  const isValidSettings = parsedSettings
    && typeof parsedSettings.soundEffects === 'boolean'
    && typeof parsedSettings.backgroundMusic === 'boolean'
    && themeOptions.some(({ value }) => value === parsedSettings.theme)

  if (!isValidSettings) {
    console.error('As configurações salvas têm um formato inválido.')
    return defaultSettings
  }

  return parsedSettings
}

function SettingsPage({ settings, onSettingChange, isModal = false }) {
  const navigate = useNavigate()

  function closeSettings() {
    navigate(isModal ? -1 : '/')
  }

  useEffect(() => {
    if (!isModal) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        navigate(-1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModal, navigate])

  return (
    <div
      className={isModal ? 'settings-overlay' : 'settings-page'}
      onClick={isModal ? (event) => {
        if (event.target === event.currentTarget) {
          closeSettings()
        }
      } : undefined}
    >
      <section
        aria-labelledby="settings-title"
        aria-modal={isModal || undefined}
        className="settings-panel"
        role={isModal ? 'dialog' : undefined}
      >
        <header className="settings-header">
          <div className="settings-heading">
            <span className="settings-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
                <path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z" />
              </svg>
            </span>
            <h1 id="settings-title">Configurações</h1>
          </div>
          <button
            aria-label="Fechar configurações"
            className="settings-close"
            onClick={closeSettings}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="settings-section">
          <h2>Som e música</h2>
          <label className="settings-toggle">
            <span>
              <span className="settings-control-icon" aria-hidden="true">◖))</span>
              <span>Efeitos sonoros</span>
            </span>
            <input
              aria-label="Efeitos sonoros"
              checked={settings.soundEffects}
              onChange={(event) => onSettingChange('soundEffects', event.target.checked)}
              role="switch"
              type="checkbox"
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>
          <label className="settings-toggle">
            <span>
              <span className="settings-control-icon settings-music-icon" aria-hidden="true">♫</span>
              <span>Música de fundo</span>
            </span>
            <input
              aria-label="Música de fundo"
              checked={settings.backgroundMusic}
              onChange={(event) => onSettingChange('backgroundMusic', event.target.checked)}
              role="switch"
              type="checkbox"
            />
            <span className="settings-switch" aria-hidden="true" />
          </label>
        </div>

        <fieldset className="settings-section settings-themes">
          <legend>Tema visual</legend>
          {themeOptions.map(({ value, label, color }) => (
            <label className="settings-theme-option" key={value}>
              <input
                checked={settings.theme === value}
                name="visual-theme"
                onChange={() => onSettingChange('theme', value)}
                type="radio"
                value={value}
              />
              <span className="settings-theme-swatch" style={{ '--swatch-color': color }} />
              <span>{label}</span>
              {settings.theme === value && <span className="settings-theme-check" aria-hidden="true">✓</span>}
            </label>
          ))}
        </fieldset>
      </section>
    </div>
  )
}

function AuthField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  error,
  autoComplete,
  inputMode,
  maxLength,
}) {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <input
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete={autoComplete}
        id={id}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        onChange={onChange}
        required
        type={type}
        value={value}
      />
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </label>
  )
}

function LoginPage() {
  const { signIn, pendingScore } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const validation = loginSchema.safeParse(values)
    if (!validation.success) {
      setFieldErrors(Object.fromEntries(
        validation.error.issues.map(({ path, message }) => [path[0], message]),
      ))
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await signIn(validation.data)
      navigate(pendingScore && !pendingScore.saved ? '/resultado' : location.state?.from?.pathname ?? '/conta', {
        replace: true,
      })
    } catch (error) {
      setFormError(error.message || 'Não foi possível entrar.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card" aria-labelledby="login-title">
      <p className="eyebrow">Bem-vindo de volta</p>
      <h1 id="login-title">Entrar</h1>
      <p className="page-description">Entre na sua conta para guardar seus resultados.</p>
      {pendingScore && (
        <p className="feature-notice">
          Há uma pontuação desta partida pendente. Ela continua apenas na memória durante o login.
        </p>
      )}
      <form className="room-form auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          autoComplete="email"
          error={fieldErrors.email}
          id="login-email"
          label="E-mail"
          name="email"
          onChange={updateField}
          type="email"
          value={values.email}
        />
        <AuthField
          autoComplete="current-password"
          error={fieldErrors.password}
          id="login-password"
          label="Senha"
          name="password"
          onChange={updateField}
          type="password"
          value={values.password}
        />
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <p className="auth-switch">
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </section>
  )
}

function SignUpPage() {
  const { pendingScore, signUp } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
    setNotice('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validation = signUpSchema.safeParse(values)
    if (!validation.success) {
      setFieldErrors(Object.fromEntries(
        validation.error.issues.map(({ path, message }) => [path[0], message]),
      ))
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    setFormError('')
    setNotice('')

    try {
      const { displayName, email, password } = validation.data
      const data = await signUp({ displayName, email, password })

      if (data.session) {
        navigate(pendingScore && !pendingScore.saved ? '/resultado' : '/conta', { replace: true })
      } else {
        setNotice('Conta criada! Confirme seu e-mail pelo link que enviamos e depois faça login.')
      }
    } catch (error) {
      setFormError(error.message || 'Não foi possível criar a conta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card" aria-labelledby="signup-title">
      <p className="eyebrow">Participe do ranking</p>
      <h1 id="signup-title">Criar conta</h1>
      <p className="page-description">Seu e-mail é usado para autenticação, não será exibido no ranking.</p>
      {pendingScore && (
        <p className="feature-notice">
          Sua pontuação permanece apenas na memória até terminar o cadastro e o registro.
        </p>
      )}
      <form className="room-form auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          autoComplete="nickname"
          error={fieldErrors.displayName}
          id="signup-name"
          label="Nome de exibição"
          name="displayName"
          onChange={updateField}
          type="text"
          value={values.displayName}
        />
        <AuthField
          autoComplete="email"
          error={fieldErrors.email}
          id="signup-email"
          label="E-mail"
          name="email"
          onChange={updateField}
          type="email"
          value={values.email}
        />
        <AuthField
          autoComplete="new-password"
          error={fieldErrors.password}
          id="signup-password"
          label="Senha (mínimo 8 caracteres)"
          name="password"
          onChange={updateField}
          type="password"
          value={values.password}
        />
        <AuthField
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          id="signup-confirm-password"
          label="Confirmar senha"
          name="confirmPassword"
          onChange={updateField}
          type="password"
          value={values.confirmPassword}
        />
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {notice && <p className="feature-notice" role="status">{notice}</p>}
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
      <p className="auth-switch">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </section>
  )
}

function AccountPage() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const displayName = session?.user?.user_metadata?.display_name || 'Jogador'

  async function handleSignOut() {
    setError('')
    setIsSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (signOutError) {
      setError(signOutError.message || 'Não foi possível sair da conta.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <section className="page-card" aria-labelledby="account-title">
      <p className="eyebrow">Sessão autenticada</p>
      <h1 id="account-title">Olá, {displayName}</h1>
      <p className="page-description">Você está conectado. Seus resultados poderão ser associados à sua conta.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button
        className="button button-primary"
        disabled={isSigningOut}
        onClick={handleSignOut}
        type="button"
      >
        {isSigningOut ? 'Saindo...' : 'Sair da conta'}
      </button>
    </section>
  )
}

function ProtectedAccountRoute() {
  const { isLoading, session, authError } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <section className="page-card" aria-live="polite">Verificando sessão...</section>
  }

  if (!session) {
    return (
      <section className="page-card" aria-labelledby="auth-required-title">
        <p className="eyebrow">Conta necessária</p>
        <h1 id="auth-required-title">Entre para continuar</h1>
        <p className="page-description">
          {authError || 'Esta área está disponível para usuários autenticados.'}
        </p>
        <Link className="button button-primary" to="/login" state={{ from: location }}>
          Ir para o login
        </Link>
      </section>
    )
  }

  return <AccountPage />
}

function RoomsPage() {
  return (
    <section className="page-card room-selection" aria-labelledby="rooms-title">
      <p className="eyebrow">Jogue com seus amigos</p>
      <h1 id="rooms-title">Criar ou entrar em uma sala</h1>
      <p className="page-description">
        Crie uma sala online ou entre com um código de convite.
      </p>
      <div className="room-options">
        <Link className="room-option" to="/salas/criar">
          <span className="room-option-icon" aria-hidden="true">+</span>
          <span>
            <strong>Criar sala</strong>
            <span>Prepare uma sala e convide seus amigos.</span>
          </span>
          <span className="room-option-arrow" aria-hidden="true">→</span>
        </Link>
        <Link className="room-option" to="/salas/entrar">
          <span className="room-option-icon" aria-hidden="true">⌁</span>
          <span>
            <strong>Entrar em uma sala</strong>
            <span>Use o código compartilhado por outro jogador.</span>
          </span>
          <span className="room-option-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
      <Link className="text-link" to="/">Voltar ao início</Link>
    </section>
  )
}

function RoomSetupPage({ action }) {
  const isCreate = action === 'criar'
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [difficulty, setDifficulty] = useState('easy')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const room = isCreate
        ? await createRoom({ difficulty, displayName })
        : await joinRoom({ inviteCode, displayName })

      navigate(`/salas/${room.room_id}`, { state: { room } })
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível concluir a operação da sala.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card" aria-labelledby="room-setup-title">
      <p className="eyebrow">Salas online</p>
      <h1 id="room-setup-title">{isCreate ? 'Criar sala' : 'Entrar em uma sala'}</h1>
      <p className="page-description">
        {isCreate
          ? 'Escolha o nível da rodada e um nome para aparecer aos outros participantes.'
          : 'Informe o código de convite e o nome que será exibido aos outros participantes.'}
      </p>
      <form className="room-form" onSubmit={handleSubmit}>
        <label className="form-field" htmlFor="display-name">
          <span>Seu nome na sala</span>
          <input
            id="display-name"
            autoComplete="nickname"
            maxLength={32}
            minLength={1}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Ex.: Ana"
            required
            value={displayName}
          />
        </label>

        {isCreate ? (
          <fieldset className="difficulty-field">
            <legend>Nível de dificuldade</legend>
            <div className="difficulty-options">
              {difficulties.map((option) => (
                <label className="difficulty-option" key={option.value}>
                  <input
                    checked={difficulty === option.value}
                    name="difficulty"
                    onChange={() => setDifficulty(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <DifficultyIcon value={option.value} />
                  <span>
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <label className="form-field" htmlFor="invite-code">
            <span>Código da sala</span>
            <input
              id="invite-code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              minLength={6}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="Ex.: A1B2C3"
              required
              value={inviteCode}
            />
            <span className="field-hint">O código tem 6 caracteres, de 0 a 9 e de A a F.</span>
          </label>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? 'Conectando...'
            : isCreate ? 'Criar sala' : 'Entrar na sala'}
        </button>
      </form>
      <Link className="text-link" to="/salas">Voltar às opções de sala</Link>
    </section>
  )
}

function RoomWaitingPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    let active = true

    async function refreshRoom() {
      try {
        const snapshot = await getRoomSnapshot(roomId)
        if (active) {
          setRoom(snapshot.room)
          setPlayers(snapshot.players)
          setError('')
          if (snapshot.room.status === 'in_progress') {
            navigate(`/salas/${roomId}/jogo`, { replace: true })
          }
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message || 'Não foi possível carregar a sala.')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void refreshRoom()

    let unsubscribe
    void Promise.resolve().then(() => {
      if (!active) {
        return
      }

      try {
        unsubscribe = subscribeToRoom(roomId, {
          onRoomChange: () => void refreshRoom(),
          onPlayersChange: () => void refreshRoom(),
          onRoundChange: () => void refreshRoom(),
          onError: (subscriptionError) => {
            if (active) {
              setError(subscriptionError.message || 'A conexão em tempo real foi interrompida.')
            }
          },
        })
      } catch (subscriptionError) {
        if (active) {
          setError(subscriptionError.message || 'Não foi possível conectar à sala.')
          setIsLoading(false)
        }
      }
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [navigate, roomId])

  async function handleStart() {
    setError('')
    setIsStarting(true)

    try {
      await startRoom(roomId)
      navigate(`/salas/${roomId}/jogo`)
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível iniciar a partida.')
    } finally {
      setIsStarting(false)
    }
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(room.invite_code)
      setCopyMessage('Código copiado.')
    } catch (copyError) {
      setCopyMessage(`Não foi possível copiar o código: ${copyError.message}`)
    }
  }

  const isHost = Boolean(room?.host_id && players.some((player) => player.user_id === room.host_id))

  return (
    <section className="page-card room-waiting" aria-labelledby="room-waiting-title">
      <p className="eyebrow">Sala de espera</p>
      <h1 id="room-waiting-title">Aguardando jogadores</h1>
      {isLoading && <p className="page-description">Carregando os dados da sala...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {room && (
        <>
          <p className="page-description">
            Compartilhe o código com seus amigos. A lista de participantes atualiza em tempo real.
          </p>
          <div className="invite-code-panel">
            <span>Código de convite</span>
            <strong>{room.invite_code}</strong>
            <button className="button button-secondary" onClick={copyInviteCode} type="button">
              Copiar código
            </button>
            {copyMessage && <span className="field-hint" role="status">{copyMessage}</span>}
          </div>
          <div className="room-summary">
            <span>Dificuldade</span>
            <strong>{difficulties.find(({ value }) => value === room.difficulty)?.label ?? room.difficulty}</strong>
          </div>
          <div className="player-list">
            <h2>Participantes <span>({players.length})</span></h2>
            {players.map((player) => (
              <div className="player-row" key={player.user_id}>
                <span className="player-avatar" aria-hidden="true">
                  {player.display_name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                </span>
                <span>{player.display_name}</span>
                {player.user_id === room.host_id && <span className="host-badge">Anfitrião</span>}
              </div>
            ))}
          </div>
          {room.status === 'waiting' && isHost && (
            <div className="start-room-actions">
              <p className="field-hint">
                {players.length < 2
                  ? 'Aguarde a entrada de pelo menos mais um jogador.'
                  : 'Todos os participantes jogarão ao mesmo tempo com a mesma palavra.'}
              </p>
              <button
                className="button button-primary"
                disabled={isStarting || players.length < 2}
                onClick={handleStart}
                type="button"
              >
                {isStarting ? 'Iniciando...' : 'Iniciar partida'}
              </button>
            </div>
          )}
          {room.status === 'waiting' && !isHost && (
            <p className="feature-notice">Aguardando o anfitrião iniciar a partida.</p>
          )}
        </>
      )}
      {!room && !isLoading && !error && (
        <p className="page-description">A sala não está disponível.</p>
      )}
      <Link className="text-link" to="/salas">Sair da sala</Link>
    </section>
  )
}

const HANGMAN_PART_COUNT = 10
const confettiColors = ['#f2bd4b', '#7fd36b', '#f29bc6', '#b685ff', '#ff9a3c', '#8fd3ff']

function useLetterKeyboard(enabled, onLetter) {
  const handlerRef = useRef(onLetter)

  useEffect(() => {
    handlerRef.current = onLetter
  })

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
        return
      }

      if (event.target instanceof Element && event.target.closest('input, textarea, select')) {
        return
      }

      const letter = event.key.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
      if (/^[A-Z]$/.test(letter)) {
        handlerRef.current(letter)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          style={{
            left: `${(index * 37) % 100}%`,
            background: confettiColors[index % confettiColors.length],
            animationDelay: `${(index % 9) * 0.12}s`,
            animationDuration: `${2.2 + (index % 5) * 0.35}s`,
            transform: `rotate(${index * 29}deg)`,
          }}
        />
      ))}
    </div>
  )
}

function Lives({ errors, maxErrors }) {
  return (
    <div className="lives" role="img" aria-label={`${Math.max(maxErrors - errors, 0)} vidas restantes de ${maxErrors}`}>
      {Array.from({ length: maxErrors }, (_, index) => (
        <span className={`life${index < errors ? ' lost' : ''}`} key={index}>♥</span>
      ))}
    </div>
  )
}

function HangmanFigure({ errors, maxErrors = MAX_ERRORS, status = 'in_progress' }) {
  const shown = errors <= 0
    ? 0
    : Math.min(HANGMAN_PART_COUNT, Math.ceil((errors / maxErrors) * HANGMAN_PART_COUNT))
  const isLost = status === 'lost'
  const isWon = status === 'won'
  const eyes = isLost
    ? <path d="M222 113l6 6m0-6l-6 6M236 113l6 6m0-6l-6 6" stroke="#1e110a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    : (
        <>
          <circle cx="225" cy="116" r={isWon ? 2.6 : 2.3} fill="#1e110a" />
          <circle cx="239" cy="116" r={isWon ? 2.6 : 2.3} fill="#1e110a" />
          <circle cx="225.8" cy="115.2" r=".8" fill="#fff" />
          <circle cx="239.8" cy="115.2" r=".8" fill="#fff" />
        </>
      )
  const mouth = isWon
    ? <path d="M224 125q8 9 16 0" stroke="#7a2b1c" strokeWidth="2.4" strokeLinecap="round" fill="#fff6e6" />
    : <path d="M226 130q6-6 12 0" stroke="#7a2b1c" strokeWidth="2.4" strokeLinecap="round" fill="none" />
  const parts = [
    <g key="head">
      <circle cx="232" cy="118" r="20" fill="#f4c99a" stroke="#3b2412" strokeWidth="3" />
      <circle cx="223" cy="124" r="4" fill="#f29bc6" opacity=".35" />
      <circle cx="241" cy="124" r="4" fill="#f29bc6" opacity=".35" />
    </g>,
    <path d="M232 138v50" key="body" stroke="#3b2412" strokeWidth="10" strokeLinecap="round" />,
    <path d="m232 152-24 24" key="left-arm" stroke="#3b2412" strokeWidth="9" strokeLinecap="round" />,
    <path d="m232 152 24 24" key="right-arm" stroke="#3b2412" strokeWidth="9" strokeLinecap="round" />,
    <path d="m232 188-18 34" key="left-leg" stroke="#3b2412" strokeWidth="10" strokeLinecap="round" />,
    <path d="m232 188 18 34" key="right-leg" stroke="#3b2412" strokeWidth="10" strokeLinecap="round" />,
    <g key="hat">
      <ellipse cx="232" cy="101" rx="28" ry="6.5" fill="#c58f3a" stroke="#3b2412" strokeWidth="2.5" />
      <path d="M216 100q2-24 16-24t16 24z" fill="#e0a94a" stroke="#3b2412" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M217 96h30" stroke="#8b4b08" strokeWidth="4" />
    </g>,
    <g key="eyes">{eyes}</g>,
    <g key="mouth">{mouth}</g>,
    <g key="boots">
      <ellipse cx="211" cy="224" rx="9" ry="5" fill="#5b3a1e" stroke="#2c1a0f" strokeWidth="2" />
      <ellipse cx="253" cy="224" rx="9" ry="5" fill="#5b3a1e" stroke="#2c1a0f" strokeWidth="2" />
    </g>,
  ]
  // Cores internas do corpo (por cima do contorno escuro).
  const fills = {
    'body': <path d="M232 138v50" stroke="#e8604c" strokeWidth="6" strokeLinecap="round" />,
    'left-arm': <path d="m232 152-24 24" stroke="#e8604c" strokeWidth="5" strokeLinecap="round" />,
    'right-arm': <path d="m232 152 24 24" stroke="#e8604c" strokeWidth="5" strokeLinecap="round" />,
    'left-leg': <path d="m232 188-18 34" stroke="#4d7fd6" strokeWidth="6" strokeLinecap="round" />,
    'right-leg': <path d="m232 188 18 34" stroke="#4d7fd6" strokeWidth="6" strokeLinecap="round" />,
  }

  return (
    <svg
      aria-label={`Forca de madeira com ${errors} de ${maxErrors} erros`}
      className={`hangman-figure ${status}`}
      role="img"
      viewBox="0 0 320 280"
    >
      <defs>
        <linearGradient id="wood-post" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7a4416" />
          <stop offset=".35" stopColor="#d18a3a" />
          <stop offset=".7" stopColor="#a8661f" />
          <stop offset="1" stopColor="#6a3a12" />
        </linearGradient>
        <linearGradient id="wood-beam" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e0a14c" />
          <stop offset=".5" stopColor="#b2702a" />
          <stop offset="1" stopColor="#74401a" />
        </linearGradient>
        <linearGradient id="stone" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8b8479" />
          <stop offset="1" stopColor="#4a443d" />
        </linearGradient>
        <radialGradient id="lantern-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffd37a" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffd37a" stopOpacity="0" />
        </radialGradient>
        <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" floodColor="#000" floodOpacity=".45" stdDeviation="3" />
        </filter>
      </defs>

      <circle cx="232" cy="130" r="110" fill="url(#lantern-glow)" opacity=".45" />

      {/* Pedra do chão */}
      <ellipse cx="160" cy="268" rx="132" ry="9" fill="#000" opacity=".35" />
      <path d="M30 248q0-12 14-12h232q14 0 14 12v10q0 8-12 8H42q-12 0-12-8z" fill="url(#stone)" stroke="#2a2420" strokeWidth="3" />
      <path d="M70 238v26M140 238v26M214 238v26" stroke="#2a2420" strokeWidth="2" opacity=".5" />
      <path d="M40 237q10-8 22-2t24 0 20-4" fill="none" stroke="#6fae45" strokeWidth="5" strokeLinecap="round" />
      <path d="M220 236q12-8 24-2t26 0" fill="none" stroke="#5e8f3d" strokeWidth="5" strokeLinecap="round" />

      {/* Madeira */}
      <g filter="url(#soft-shadow)">
        <rect x="70" y="30" width="26" height="210" rx="4" fill="url(#wood-post)" stroke="#3b2412" strokeWidth="3" />
        <rect x="70" y="30" width="196" height="26" rx="4" fill="url(#wood-beam)" stroke="#3b2412" strokeWidth="3" />
        <path d="M96 124 154 56h-28l-30 36z" fill="url(#wood-beam)" stroke="#3b2412" strokeWidth="3" strokeLinejoin="round" />
      </g>
      <path d="M78 66v160M86 80v130M82 40h170M120 48h120" stroke="#5a2f10" strokeWidth="1.4" opacity=".35" fill="none" />
      <path d="M74 34h4v200h-4z" fill="#fff" opacity=".12" />
      <circle cx="83" cy="43" r="3" fill="#2c1a0f" />
      <circle cx="255" cy="43" r="3" fill="#2c1a0f" />
      <circle cx="83" cy="226" r="3" fill="#2c1a0f" />

      {/* Lanterna pendurada */}
      <g className="gallows-lantern">
        <path d="M106 56v14" stroke="#3b2412" strokeWidth="2.5" />
        <rect x="98" y="70" width="16" height="20" rx="4" fill="#ffd37a" stroke="#3b2412" strokeWidth="2.5" />
        <path d="M98 78h16M98 84h16" stroke="#3b2412" strokeWidth="1.4" />
      </g>

      {/* Corda + personagem */}
      <g className={`hanging-group${isLost ? ' is-lost' : ''}`}>
        <path d="M232 56v34" stroke="#e9c27a" strokeWidth="5" strokeLinecap="round" />
        <path d="M232 56v34" stroke="#8b5a20" strokeWidth="1.2" strokeDasharray="3 3" />
        <ellipse cx="232" cy="102" rx="14" ry="15" fill="none" stroke="#e9c27a" strokeWidth="4.5" />
        <rect x="226" y="86" width="12" height="8" rx="3" fill="#c9985a" stroke="#6a3a12" strokeWidth="1.6" />
        {parts.slice(0, shown).map((part) => (
          <g className="hangman-part" key={part.key}>
            {part}
            {fills[part.key]}
          </g>
        ))}
      </g>

      {/* Vaga-lumes */}
      <g className="fireflies">
        <circle cx="40" cy="90" r="2.6" />
        <circle cx="290" cy="160" r="2.2" />
        <circle cx="300" cy="70" r="2.6" />
        <circle cx="46" cy="170" r="2" />
      </g>
    </svg>
  )
}

function HangmanStage({ errors, maxErrors = MAX_ERRORS, status = 'in_progress' }) {
  return (
    <div className={`hangman-stage ${status}`}>
      <HangmanFigure errors={errors} maxErrors={maxErrors} status={status} />
      <Lives errors={errors} maxErrors={maxErrors} />
      {status === 'won' && <Confetti />}
    </div>
  )
}

function RoundPage({ soundEffectsEnabled }) {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { setPendingScore } = useAuth()
  const [round, setRound] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function refreshRound() {
      try {
        const nextRound = await getRoundState(roomId)
        if (active) {
          setRound(nextRound)
          setSeconds(nextRound.elapsed_seconds)
          setError('')
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message || 'Não foi possível carregar a rodada.')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void refreshRound()

    let unsubscribe
    void Promise.resolve().then(() => {
      if (!active) {
        return
      }

      try {
        unsubscribe = subscribeToRoom(roomId, {
          onRoomChange: () => void refreshRound(),
          onPlayersChange: () => {},
          onRoundChange: () => void refreshRound(),
          onError: (subscriptionError) => {
            if (active) {
              setError(subscriptionError.message || 'A conexão em tempo real foi interrompida.')
            }
          },
        })
      } catch (subscriptionError) {
        if (active) {
          setError(subscriptionError.message || 'Não foi possível conectar à rodada.')
          setIsLoading(false)
        }
      }
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [roomId])

  useEffect(() => {
    if (round?.status !== 'in_progress') {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setSeconds((currentSeconds) => currentSeconds + 1)
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [round?.status])

  async function handleGuess(letter) {
    if (!round || round.status !== 'in_progress' || isSubmitting) {
      return
    }

    if (round.correct_letters?.includes(letter) || round.incorrect_letters?.includes(letter)) {
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const nextRound = await submitGuess(roomId, letter)
      setRound(nextRound)
      setSeconds(nextRound.elapsed_seconds)
      if (soundEffectsEnabled) {
        if (nextRound.status !== round.status) {
          playRoundEndSound(nextRound.status)
        } else {
          playGuessSound(nextRound.correct_letters.includes(letter))
        }
      }
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível registrar seu palpite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const elapsedLabel = formatElapsedTime(seconds)
  const guessedLetters = new Set([
    ...(round?.correct_letters ?? []),
    ...(round?.incorrect_letters ?? []),
  ])
  const isFinished = round?.status === 'won' || round?.status === 'lost'

  useLetterKeyboard(round?.status === 'in_progress' && !isSubmitting, handleGuess)

  useEffect(() => {
    if (!isFinished) {
      return
    }

    setPendingScore((currentScore) => (
      currentScore?.roomId === roomId
        ? currentScore
        : {
            roomId,
            status: round.status,
            difficulty: round.difficulty,
            elapsedSeconds: round.elapsed_seconds,
            errors: round.errors,
          }
    ))
  }, [isFinished, roomId, round, setPendingScore])

  const registration = useScoreRegistration()

  return (
    <section className={`page-card round-card${round ? ' is-playing' : ''}${isFinished ? ` finished-${round.status}` : ''}`} aria-labelledby="round-title">
      <p className="eyebrow">Partida em andamento</p>
      <h1 id="round-title">
        {round?.status === 'won' ? 'Você venceu!' : round?.status === 'lost' ? 'Você perdeu' : 'Descubra a palavra'}
      </h1>

      {isLoading && <p className="page-description">Carregando a rodada...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {round && (
        <>
          <HangmanStage errors={round.errors} maxErrors={round.max_errors} status={round.status} />

          <div className="round-game-panel">
            <div className="round-stats">
              <div><span>Tempo</span><strong>{elapsedLabel}</strong></div>
              <div><span>Erros</span><strong>{round.errors}/{round.max_errors}</strong></div>
              <div><span>Nível</span><strong>{difficulties.find(({ value }) => value === round.difficulty)?.label}</strong></div>
            </div>

            <div className="clue-board">
              <span>Palavra com <b>{(round.masked_word ?? '').length}</b> letras</span>
              {(round.incorrect_letters ?? []).length > 0 && (
                <span>Erradas: <b className="clue-wrong">{round.incorrect_letters.join(' ')}</b></span>
              )}
            </div>

            <div className="word-display" aria-label="Palavra oculta">
              {Array.from(round.masked_word ?? '').map((letter, index) => (
                <span className="word-letter" key={`${index}-${letter}`}>
                  {letter === '_' ? '' : letter}
                </span>
              ))}
            </div>

            {isFinished && (
              <div className={`round-result ${round.status}`} role="status">
                <strong>{round.status === 'won' ? '🎉 Parabéns!' : '💀 Fim da rodada'}</strong>
                <span>A palavra era <b>{round.revealed_word}</b>.</span>
                <span>Seu tempo: {elapsedLabel} · Erros: {round.errors}</span>
                {round.status === 'won' && <RankingStatus registration={registration} />}
              </div>
            )}

            <div className="letter-keyboard" aria-label="Teclado de letras">
              {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => {
                const isGuessed = guessedLetters.has(letter)
                const isCorrect = round.correct_letters?.includes(letter)

                return (
                  <button
                    aria-label={`Letra ${letter}${isGuessed ? ' já utilizada' : ''}`}
                    className={`letter-key${isGuessed ? isCorrect ? ' correct' : ' incorrect' : ''}`}
                    disabled={isGuessed || round.status !== 'in_progress' || isSubmitting}
                    key={letter}
                    onClick={() => void handleGuess(letter)}
                    type="button"
                  >
                    {letter}
                  </button>
                )
              })}
            </div>

            {isFinished && (
              <div className="home-actions">
                <button
                  className="button button-primary"
                  onClick={() => navigate('/resultado')}
                  type="button"
                >
                  Ver resultado
                </button>
                <NavLink className="button button-secondary" to="/ranking">Ver ranking</NavLink>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function SoloGamePage({ mode = 'solo', soundEffectsEnabled }) {
  const isIndividual = mode === 'individual'
  const modeLabel = isIndividual ? 'individual' : 'solo'
  const heading = isIndividual ? 'Jogar individual' : 'Jogar sozinho'
  const eyebrow = isIndividual ? 'Modo individual' : 'Modo solo'
  const { setPendingScore } = useAuth()
  const registration = useScoreRegistration()

  const [difficulty, setDifficulty] = useState('easy')
  const [round, setRound] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function startNewGame(nextDifficulty = difficulty) {
    setPendingScore(null)
    setRound(createSoloRound(nextDifficulty))
    setSeconds(0)
    setError('')
    setIsSubmitting(false)
    if (soundEffectsEnabled) {
      playGameStartSound()
    }
  }

  function changeDifficulty() {
    setPendingScore(null)
    setRound(null)
    setSeconds(0)
  }

  useEffect(() => {
    if (!round || round.status !== 'in_progress') {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setSeconds((currentSeconds) => currentSeconds + 1)
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [round])

  async function handleGuess(letter) {
    if (!round || round.status !== 'in_progress' || isSubmitting) {
      return
    }

    if (round.correctGuesses.includes(letter) || round.incorrectGuesses.includes(letter)) {
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const nextRound = guessLetter(round, letter)
      setRound(nextRound)
      if (soundEffectsEnabled) {
        if (nextRound.status !== round.status) {
          playRoundEndSound(nextRound.status)
        } else {
          playGuessSound(nextRound.correctGuesses.includes(letter))
        }
      }
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível registrar seu palpite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const elapsedLabel = formatElapsedTime(seconds)
  const guessedLetters = new Set([
    ...(round?.correctGuesses ?? []),
    ...(round?.incorrectGuesses ?? []),
  ])
  const isFinished = round?.status === 'won' || round?.status === 'lost'
  const errorCount = round?.incorrectGuesses.length ?? 0

  useLetterKeyboard(round?.status === 'in_progress' && !isSubmitting, handleGuess)

  // Guarda o resultado da partida: é isso que o ranking envia ao Supabase quando a pessoa está logada.
  useEffect(() => {
    if (!isFinished) {
      return
    }

    setPendingScore((currentScore) => (
      currentScore?.source === round
        ? currentScore
        : {
            source: round,
            status: round.status,
            difficulty,
            elapsedSeconds: seconds,
            errors: round.incorrectGuesses.length,
          }
    ))
  }, [difficulty, isFinished, round, seconds, setPendingScore])

  return (
    <section className={`page-card round-card${round ? ' is-playing' : ''}${isFinished ? ` finished-${round.status}` : ''}`} aria-labelledby={`${modeLabel}-title`}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 id={`${modeLabel}-title`}>{heading}</h1>

      {!round && (
        <fieldset className="difficulty-field">
          <legend>Escolha o nível antes de iniciar a partida</legend>
          <div className="difficulty-options">
            {difficulties.map((option) => (
              <label className="difficulty-option" key={option.value}>
                <input
                  checked={difficulty === option.value}
                  name={`${modeLabel}-difficulty`}
                  onChange={() => setDifficulty(option.value)}
                  type="radio"
                  value={option.value}
                />
                <DifficultyIcon value={option.value} />
                <span>
                  <strong>{option.label}</strong>
                  <span>{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {!round && (
        <div className="home-actions" style={{ justifyContent: 'center' }}>
          <button
            className="button button-primary"
            onClick={() => startNewGame(difficulty)}
            type="button"
          >
            Iniciar partida
          </button>
        </div>
      )}

      {round && (
        <>
          <HangmanStage errors={errorCount} maxErrors={MAX_ERRORS} status={round.status} />

          <div className="round-game-panel">
            <div className="round-stats">
              <div><span>Tempo</span><strong>{elapsedLabel}</strong></div>
              <div><span>Erros</span><strong>{errorCount}/{MAX_ERRORS}</strong></div>
              <div><span>Nível</span><strong>{difficulties.find(({ value }) => value === difficulty)?.label}</strong></div>
            </div>

            <div className="clue-board">
              <span>Palavra com <b>{round.word.length}</b> letras</span>
              {errorCount > 0 && (
                <span>Erradas: <b className="clue-wrong">{round.incorrectGuesses.join(' ')}</b></span>
              )}
            </div>

            <div className="word-display" aria-label="Palavra oculta">
              {Array.from(round.word ?? '').map((letter, index) => (
                <span className="word-letter" key={`${index}-${letter}`}>
                  {round.correctGuesses.includes(normalizeWord(letter)) || round.status === 'lost' ? letter : ''}
                </span>
              ))}
            </div>

            {isFinished && (
              <div className={`round-result ${round.status}`} role="status">
                <strong>{round.status === 'won' ? '🎉 Parabéns!' : '💀 Fim da rodada'}</strong>
                <span>A palavra era <b>{round.word}</b>.</span>
                <span>Seu tempo: {elapsedLabel} · Erros: {errorCount}</span>
                {round.status === 'won'
                  ? <RankingStatus registration={registration} />
                  : <span className="ranking-status">Partidas perdidas não entram no ranking.</span>}
              </div>
            )}

            <div className="letter-keyboard" aria-label="Teclado de letras">
              {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => {
                const isGuessed = guessedLetters.has(letter)
                const isCorrect = round.correctGuesses?.includes(letter)

                return (
                  <button
                    aria-label={`Letra ${letter}${isGuessed ? ' já utilizada' : ''}`}
                    className={`letter-key${isGuessed ? isCorrect ? ' correct' : ' incorrect' : ''}`}
                    disabled={isGuessed || round.status !== 'in_progress' || isSubmitting}
                    key={letter}
                    onClick={() => void handleGuess(letter)}
                    type="button"
                  >
                    {letter}
                  </button>
                )
              })}
            </div>

            <div className="home-actions">
              <button className="button button-primary" onClick={() => startNewGame()} type="button">
                Nova partida
              </button>
              <button className="button button-secondary" onClick={changeDifficulty} type="button">
                Trocar nível
              </button>
              <NavLink className="button button-secondary" to="/ranking">Ranking</NavLink>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function HomePage() {
  return (
    <section className="home-card" aria-labelledby="home-title">
      <div className="home-sign">
        <h1 id="home-title">Jogo da <span>Forca</span></h1>
        <p>Aventura das palavras</p>
      </div>
      <CaveMouth />
      <p className="page-description">
        Escolha como deseja jogar. Depois selecione o nível e comece a partida.
      </p>
      <div className="home-actions">
        <div className="home-play-actions">
          <NavLink className="button button-primary" to="/solo">Jogar sozinho</NavLink>
          <NavLink className="button button-secondary" to="/salas">Jogar com amigos</NavLink>
        </div>
        <NavLink className="button button-secondary home-ranking-button" to="/ranking">Ver ranking</NavLink>
      </div>
    </section>
  )
}

function NotFoundPage() {
  return (
    <section className="page-card" aria-labelledby="not-found-title">
      <p className="eyebrow">Erro 404</p>
      <h1 id="not-found-title">Página não encontrada</h1>
      <p className="page-description">Confira o endereço ou volte para o menu inicial.</p>
      <NavLink className="button button-primary" to="/">Voltar ao início</NavLink>
    </section>
  )
}

function AppLayout() {
  const { session } = useAuth()
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation
  const scenePath = (backgroundLocation || location).pathname
  const scene = /^\/(solo|individual|salas)/.test(scenePath) ? 'cave' : 'forest'
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  }, [settings])

  function updateSetting(name, value) {
    setSettings((currentSettings) => ({ ...currentSettings, [name]: value }))

    if (name === 'backgroundMusic') {
      if (value) {
        startBackgroundMusic()
      } else {
        stopBackgroundMusic()
      }
    }
  }

  function handleAppClick(event) {
    if (!(event.target instanceof Element)) {
      return
    }

    const clickedControl = event.target.closest('a, input, label, button:not(.letter-key):not(.button)')
    if (settings.soundEffects && clickedControl) {
      playSoundEffect()
    }
    if (settings.backgroundMusic) {
      startBackgroundMusic()
    }
  }

  const settingsPage = (
    <SettingsPage settings={settings} onSettingChange={updateSetting} />
  )

  return (
    <div className="app-shell" data-scene={scene} onClickCapture={handleAppClick}>
      <SceneDecor />
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="Jogo da Forca — início">
          FORCA<span>.</span>
        </NavLink>
        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/">Jogar</NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          <NavLink to={session ? '/conta' : '/login'}>
            {session ? 'Minha conta' : 'Entrar'}
          </NavLink>
          <NavLink
            aria-label="Configurações"
            state={{ backgroundLocation: location }}
            to="/configuracoes"
          >
            Configurações
          </NavLink>
        </nav>
      </header>

      <main className="page-content">
        <Routes location={backgroundLocation || location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/solo" element={<SoloGamePage soundEffectsEnabled={settings.soundEffects} />} />
          <Route path="/salas" element={<RoomsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignUpPage />} />
          <Route path="/resultado" element={<ResultPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/conta" element={<ProtectedAccountRoute />} />
          <Route path="/configuracoes" element={settingsPage} />
          <Route path="/salas/criar" element={<RoomSetupPage action="criar" />} />
          <Route path="/salas/entrar" element={<RoomSetupPage action="entrar" />} />
          <Route path="/salas/:roomId/jogo" element={<RoundPage soundEffectsEnabled={settings.soundEffects} />} />
          <Route path="/salas/:roomId" element={<RoomWaitingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        {backgroundLocation && (
          <Routes location={location}>
            <Route
              path="/configuracoes"
              element={<SettingsPage settings={settings} onSettingChange={updateSetting} isModal />}
            />
          </Routes>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App