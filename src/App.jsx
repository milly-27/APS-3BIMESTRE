import { useCallback, useEffect, useRef, useState } from 'react'
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
} from './contexts/AuthContext.jsx'
import {
  createRoom,
  getRoundState,
  getRoomSnapshot,
  joinRoom,
  subscribeToRoom,
  startRoom,
  submitGuess,
} from './services/roomService.js'
import { getLeaderboard, saveBestResult } from './services/rankingService.js'
import {
  calculateScore,
  createRound,
  expireRound,
  guessLetter,
  normalizeWord,
} from './features/game/gameRules.js'
import { chooseWord, isSupportedDifficulty } from './features/game/words.js'
import './App.css'

const difficulties = [
  { value: 'easy', label: 'Fácil', detail: '3 a 5 letras' },
  { value: 'medium', label: 'Médio', detail: '6 a 8 letras' },
  { value: 'hard', label: 'Difícil', detail: '9 a 12 letras' },
  { value: 'expert', label: 'Muito Difícil', detail: '14 letras ou mais' },
]

const ROUND_TIME_LIMIT_SECONDS = 90

function formatElapsedTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function readStoredValue(key, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue === null ? fallback : JSON.parse(rawValue)
  } catch {
    return fallback
  }
}

function writeStoredValue(key, value) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignora falhas por limitação de armazenamento do navegador.
  }
}

function playTone({ enabled, frequency, duration = 0.12, type = 'sine' }) {
  if (!enabled || typeof window === 'undefined') {
    return
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) {
    return
  }

  const audioContext = new AudioContextCtor()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency
  gainNode.gain.value = 0.08

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  oscillator.start()

  window.setTimeout(() => {
    oscillator.stop()
    void audioContext.close()
  }, duration * 1000)
}

function getAchievementList(result) {
  if (!result) {
    return []
  }

  const achievements = []

  if (result.status === 'won') {
    achievements.push({ id: 'victory', title: 'Vitória', description: 'Conquistou uma rodada.' })
  }

  if (result.errors === 0 && result.status === 'won') {
    achievements.push({ id: 'perfect', title: 'Sem erros', description: 'Venceu sem errar nenhuma letra.' })
  }

  if (result.elapsedSeconds <= 30 && result.status === 'won') {
    achievements.push({ id: 'speed', title: 'Resposta rápida', description: 'Terminou a rodada em 30 segundos ou menos.' })
  }

  if (result.status === 'lost') {
    achievements.push({ id: 'survivor', title: 'Persistência', description: 'Ainda tentou até o fim da rodada.' })
  }

  return achievements
}

function SettingsPage({ theme, setTheme, soundEnabled, setSoundEnabled }) {
  const navigate = useNavigate()
  const location = useLocation()
  const dialogRef = useRef(null)
  const closeSettings = useCallback(() => {
    navigate(location.state?.backgroundLocation ? -1 : '/')
  }, [location.state?.backgroundLocation, navigate])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeSettings()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeSettings])

  return (
    <div className="settings-overlay">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex="-1"
      >
        <header className="settings-header">
          <div>
            <p className="eyebrow">Preferências</p>
            <h1 id="settings-title">Configurações</h1>
          </div>
          <button
            aria-label="Fechar configurações"
            className="settings-close"
            onClick={closeSettings}
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-copy">
              <label htmlFor="settings-theme"><strong>Tema visual</strong></label>
              <span>Escolha a aparência do jogo.</span>
            </div>
            <select
              className="settings-select"
              id="settings-theme"
              onChange={(event) => setTheme(event.target.value)}
              value={theme}
            >
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </select>
          </div>

          <div className="settings-item">
            <div className="settings-item-copy">
              <strong id="settings-sound-label">Efeitos sonoros</strong>
              <span id="settings-sound-description">Sons de acerto e erro durante a partida.</span>
            </div>
            <button
              aria-checked={soundEnabled}
              aria-describedby="settings-sound-description"
              aria-labelledby="settings-sound-label"
              className="settings-toggle"
              onClick={() => setSoundEnabled((current) => !current)}
              role="switch"
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="settings-note">As alterações são salvas automaticamente neste dispositivo.</p>
      </section>
    </div>
  )
}

function RankingPage() {
  const [entries, setEntries] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)
  const activeDifficulty = selectedDifficulty
    ?? difficulties.find(({ value }) => entries?.[value]?.length > 0)?.value
    ?? difficulties[0].value
  const selectedDifficultyLabel = difficulties.find(({ value }) => value === activeDifficulty)?.label
  const selectedEntries = entries?.[activeDifficulty] ?? []

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
      <div className="ranking-heading">
        <span className="ranking-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <path d="M16 8h16v7h6v4a8 8 0 0 1-8 8h-2v5h5v5H15v-5h5v-5h-2a8 8 0 0 1-8-8v-4h6V8Zm0 11h-2a4 4 0 0 0 4 4h1a14 14 0 0 1-3-4Zm16 0a14 14 0 0 1-3 4h1a4 4 0 0 0 4-4h-2Z" />
          </svg>
        </span>
        <div className="ranking-heading-copy">
          <p className="eyebrow">Melhores jogadores</p>
          <h1 id="ranking-title">Ranking</h1>
        </div>
      </div>
      <p className="page-description">
        Veja os recordes enviados pelos jogadores em cada nível de dificuldade.
      </p>
      <div className="ranking-filters" role="group" aria-label="Filtrar ranking por dificuldade">
        {difficulties.map(({ value, label }) => (
          <button
            aria-pressed={activeDifficulty === value}
            className="ranking-filter"
            key={value}
            onClick={() => setSelectedDifficulty(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading && <p className="page-description" aria-live="polite">Carregando ranking...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!isLoading && !error && selectedEntries.length === 0 && (
        <p className="ranking-empty-state">Ainda não há recordes em {selectedDifficultyLabel?.toLocaleLowerCase('pt-BR')}. Seja o primeiro!</p>
      )}
      {!isLoading && !error && selectedEntries.length > 0 && (
        <section className="ranking-board" aria-labelledby="ranking-difficulty-title">
          <div className="ranking-board-header">
            <h2 id="ranking-difficulty-title">{selectedDifficultyLabel}</h2>
            <span>Top {selectedEntries.length}</span>
          </div>
          <ol className="ranking-list" aria-label={`Melhores resultados: ${selectedDifficultyLabel}`}>
            {selectedEntries.map((entry, index) => (
              <li
                className={`ranking-row${index === 0 ? ' top-ranked' : ''}`}
                key={`${entry.display_name}-${entry.updated_at}-${index}`}
              >
                <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                <span className="ranking-avatar" aria-hidden="true">
                  {entry.display_name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                </span>
                <span className="ranking-player">
                  <strong>{entry.display_name}</strong>
                  {index === 0 && <span>Melhor recorde</span>}
                </span>
                <span className="ranking-score">
                  <strong>{formatElapsedTime(entry.elapsed_seconds)}</strong>
                  <span>{entry.errors} {entry.errors === 1 ? 'erro' : 'erros'}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  )
}

function ResultPage() {
  const { pendingScore, session, setPendingScore } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [savedResult, setSavedResult] = useState(null)
  const [isSoloResult] = useState(() => pendingScore?.roomId?.startsWith('solo-') ?? false)
  const isRegisteredUser = Boolean(session?.user && !session.user.is_anonymous)
  const displayName = session?.user?.user_metadata?.display_name || 'Jogador'
  const displayedResult = pendingScore ?? savedResult
  const isWon = displayedResult?.status === 'won'
  const resultScore = displayedResult
    ? calculateScore({
        difficulty: displayedResult.difficulty,
        elapsedSeconds: displayedResult.elapsedSeconds,
        errors: displayedResult.errors,
        won: isWon,
      })
    : null
  const achievements = getAchievementList(displayedResult)

  useEffect(() => {
    if (!pendingScore || pendingScore.status !== 'won' || !isRegisteredUser || !displayName) {
      return undefined
    }

    let active = true
    Promise.resolve()
      .then(() => {
        if (!active) {
          return undefined
        }

        setIsSaving(true)
        setNotice('')
        setError('')
        return saveBestResult({
          displayName,
          difficulty: pendingScore.difficulty,
          elapsedSeconds: pendingScore.elapsedSeconds,
          errors: pendingScore.errors,
        })
      })
      .then((isNewRecord) => {
        if (!active || typeof isNewRecord !== 'boolean') {
          return
        }

        setNotice(isNewRecord
          ? 'Resultado registrado. Seu recorde foi atualizado!'
          : 'Resultado recebido. Seu recorde anterior continua valendo.')
        setSavedResult(pendingScore)
        setPendingScore(null)
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || 'Não foi possível registrar o resultado.')
        }
      })
      .finally(() => {
        if (active) {
          setIsSaving(false)
        }
      })

    return () => {
      active = false
    }
  }, [displayName, isRegisteredUser, pendingScore, setPendingScore])

  return (
    <section className={`page-card endgame-card ${displayedResult?.status ?? 'empty'}`} aria-labelledby="result-title">
      <div className="endgame-heading">
        <span className="endgame-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <path d="M16 8h16v7h6v4a8 8 0 0 1-8 8h-2v5h5v5H15v-5h5v-5h-2a8 8 0 0 1-8-8v-4h6V8Zm0 11h-2a4 4 0 0 0 4 4h1a14 14 0 0 1-3-4Zm16 0a14 14 0 0 1-3 4h1a4 4 0 0 0 4-4h-2Z" />
          </svg>
        </span>
        <p className="eyebrow">Partida finalizada</p>
        <h1 id="result-title">Fim de jogo!</h1>
        <p className="endgame-subtitle">
          {isWon
            ? `${displayName}, você venceu!`
            : displayedResult
              ? 'A rodada terminou. Tente novamente!'
              : 'Não há um resultado recente para exibir.'}
        </p>
      </div>

      {displayedResult && (
        <div className="endgame-score-panel">
          <div className="endgame-player">
            <span className="endgame-avatar" aria-hidden="true">
              {displayName.slice(0, 1).toLocaleUpperCase('pt-BR')}
            </span>
            <div className="endgame-player-info">
              <strong>{displayName}</strong>
              <span>{isWon ? 'Vitória' : 'Rodada encerrada'}</span>
            </div>
            <strong className="endgame-points">
              {resultScore} {resultScore === 1 ? 'ponto' : 'pontos'}
            </strong>
          </div>
          <div className="endgame-stats">
            <div>
              <span>Tempo</span>
              <strong>{formatElapsedTime(displayedResult.elapsedSeconds)}</strong>
            </div>
            <div>
              <span>Erros</span>
              <strong>{displayedResult.errors}</strong>
            </div>
            <div>
              <span>Dificuldade</span>
              <strong>
                {difficulties.find(({ value }) => value === displayedResult.difficulty)?.label
                  ?? displayedResult.difficulty}
              </strong>
            </div>
          </div>
        </div>
      )}

      {!pendingScore && !savedResult && (
        <p className="page-description">Jogue uma rodada para ver seus pontos e estatísticas aqui.</p>
      )}
      {pendingScore?.status === 'won' && !isRegisteredUser && (
        <div className="endgame-register">
          <p className="page-description">Entre ou crie uma conta para registrar sua vitória no ranking.</p>
          <Link className="button button-primary" to="/login">Entrar para registrar</Link>
        </div>
      )}
      {isSaving && <p className="page-description" aria-live="polite">Registrando resultado...</p>}
      {notice && <p className="feature-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {achievements.length > 0 && (
        <details className="achievement-box">
          <summary>Conquistas ({achievements.length})</summary>
          <ul>
            {achievements.map((achievement) => (
              <li key={achievement.id}>
                <strong>{achievement.title}</strong>
                <span>{achievement.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="endgame-actions">
        <Link className="button button-primary" to={isSoloResult ? '/solo' : '/salas'}>Jogar novamente</Link>
        <Link className="button button-secondary" to="/">Voltar ao menu</Link>
        <Link className="text-link endgame-ranking-link" to="/ranking">Ver ranking</Link>
      </div>
    </section>
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
  pattern,
  placeholder,
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
        pattern={pattern}
        placeholder={placeholder}
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
      navigate(pendingScore ? '/resultado' : location.state?.from?.pathname ?? '/conta', {
        replace: true,
      })
    } catch (error) {
      setFormError(error.message || 'Não foi possível entrar.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-card auth-card auth-login-card" aria-labelledby="login-title">
      <div className="auth-heading">
        <span className="auth-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </svg>
        </span>
        <div>
          <p className="eyebrow">Bem-vindo de volta</p>
          <h1 id="login-title">Entrar</h1>
        </div>
      </div>
      <p className="page-description auth-description">Entre na sua conta para guardar seus resultados.</p>
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
  const { resendVerificationCode, signIn, signUp, verifyEmailCode, pendingScore } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    otpCode: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingOtp, setPendingOtp] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
    setNotice('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')

    if (pendingOtp) {
      const token = values.otpCode.trim()

      if (!token) {
        setFieldErrors((current) => ({ ...current, otpCode: 'Informe o código recebido por e-mail.' }))
        return
      }

      setFieldErrors({})
      setIsSubmitting(true)
      try {
        await verifyEmailCode({ email: pendingOtp.email, token })
        const result = await signIn({ email: pendingOtp.email, password: pendingOtp.password })

        if (result.session) {
          navigate(pendingScore ? '/resultado' : '/conta', { replace: true })
        }
      } catch {
        setFormError('Código inválido ou expirado. Solicite um novo código e tente novamente.')
      } finally {
        setIsSubmitting(false)
      }

      return
    }

    const validation = signUpSchema.safeParse(values)
    if (!validation.success) {
      setFieldErrors(Object.fromEntries(
        validation.error.issues.map(({ path, message }) => [path[0], message]),
      ))
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { displayName, email, password } = validation.data
      const result = await signUp({ displayName, email, password })

      if (result.session) {
        navigate(pendingScore ? '/resultado' : '/conta', { replace: true })
        return
      }

      setPendingOtp({ email, password })
      setResendCooldown(30)
      setNotice('Conta criada. Enviamos um código para o seu e-mail. Digite o código abaixo para confirmar e continuar.')
      setValues((current) => ({ ...current, otpCode: '' }))
    } catch (error) {
      setFormError(error.message || 'Não foi possível criar a conta.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendCode() {
    if (!pendingOtp?.email) {
      return
    }

    if (resendCooldown > 0) {
      return
    }

    setFormError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      await resendVerificationCode({ email: pendingOtp.email })
      setResendCooldown(30)
      setNotice('Um novo código foi enviado para o seu e-mail.')
      setValues((current) => ({ ...current, otpCode: '' }))
    } catch (error) {
      setFormError(error.message || 'Não foi possível reenviar o código.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isVerificationStep = Boolean(pendingOtp)

  return (
    <section className="page-card auth-card auth-signup-card" aria-labelledby="signup-title">
      <div className="auth-heading">
        <span className="auth-heading-icon" aria-hidden="true">
          {isVerificationStep ? (
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
              <path d="m5 7 7 5.5L19 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 20a5.5 5.5 0 0 1 11 0M18 8v6m-3-3h6" />
            </svg>
          )}
        </span>
        <div>
          <p className="eyebrow">{isVerificationStep ? 'Confirme seu e-mail' : 'Participe do ranking'}</p>
          <h1 id="signup-title">{isVerificationStep ? 'Confirmar e-mail' : 'Criar conta'}</h1>
        </div>
      </div>
      <p className="page-description auth-description">
        {isVerificationStep
          ? 'Digite o código de seis dígitos enviado para confirmar sua conta.'
          : 'Seu e-mail é usado para autenticação e não será exibido no ranking.'}
      </p>
      {pendingScore && (
        <p className="feature-notice">
          Sua pontuação permanece apenas na memória até terminar o cadastro e o registro.
        </p>
      )}
      <form className="room-form auth-form" onSubmit={handleSubmit} noValidate>
        {!pendingOtp && (
          <>
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
          </>
        )}
        {pendingOtp && (
          <div className="otp-panel">
            <div className="otp-header">
              <span className="otp-badge">Código</span>
              <span className="otp-meta">Recebido em {pendingOtp.email}</span>
            </div>
            <AuthField
              autoComplete="one-time-code"
              error={fieldErrors.otpCode}
              id="signup-otp-code"
              inputMode="numeric"
              label="Código de confirmação"
              maxLength={6}
              name="otpCode"
              onChange={(event) => {
                const nextValue = event.target.value.replace(/\D/g, '').slice(0, 6)
                updateField({ target: { name: 'otpCode', value: nextValue } })
              }}
              pattern="[0-9]*"
              placeholder="123456"
              type="text"
              value={values.otpCode}
            />
          </div>
        )}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {notice && <p className="feature-notice" role="status">{notice}</p>}
        {pendingOtp && (
          <div className="otp-actions">
            <button
              className="button button-secondary"
              disabled={isSubmitting || resendCooldown > 0}
              onClick={handleResendCode}
              type="button"
            >
              {isSubmitting
                ? 'Enviando código...'
                : resendCooldown > 0
                  ? `Enviar outro código (${resendCooldown}s)`
                  : 'Enviar outro código'}
            </button>
          </div>
        )}
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? pendingOtp
              ? 'Validando código...'
              : 'Criando conta...'
            : pendingOtp
              ? 'Confirmar código'
              : 'Criar conta'}
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
    <section className="page-card account-card" aria-labelledby="account-title">
      <div className="account-heading">
        <span className="account-avatar" aria-hidden="true">
          {displayName.slice(0, 1).toLocaleUpperCase('pt-BR')}
        </span>
        <div>
          <p className="eyebrow">Minha conta</p>
          <h1 id="account-title">Olá, {displayName}</h1>
        </div>
        <span className="account-status"><span />Conectado</span>
      </div>
      <p className="page-description account-description">
        Você está conectado. Seus resultados poderão ser associados à sua conta.
      </p>
      <div className="account-details">
        <div>
          <span>Nome de exibição</span>
          <strong>{displayName}</strong>
        </div>
        {session?.user?.email && (
          <div>
            <span>E-mail</span>
            <strong>{session.user.email}</strong>
          </div>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button
        className="button button-secondary account-signout"
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
    return (
      <section className="page-card account-card account-loading" aria-live="polite">
        <span className="account-loading-indicator" aria-hidden="true" />
        <p>Verificando sessão...</p>
      </section>
    )
  }

  if (!session) {
    return (
      <section className="page-card account-card account-required" aria-labelledby="auth-required-title">
        <span className="account-required-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="8" r="3" />
            <path d="M5 20a7 7 0 0 1 14 0M18 11v3m-2-1.5h4" />
          </svg>
        </span>
        <p className="eyebrow">Conta necessária</p>
        <h1 id="auth-required-title">Entre para continuar</h1>
        <p className="page-description">
          {authError || 'Entre ou crie uma conta para acessar seu perfil e guardar seus resultados.'}
        </p>
        <div className="account-required-actions">
          <Link className="button button-primary" to="/login" state={{ from: location }}>
            Entrar
          </Link>
          <Link className="button button-secondary" to="/cadastro">
            Criar conta
          </Link>
        </div>
      </section>
    )
  }

  return <AccountPage />
}

function RoomsPage() {
  return (
    <section className="page-card room-selection room-selection-card" aria-labelledby="rooms-title">
      <div className="rooms-heading">
        <span className="rooms-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8m1 3.2a5 5 0 0 1 3.5 4.5" />
          </svg>
        </span>
        <div>
          <p className="eyebrow">Modo online</p>
          <h1 id="rooms-title">Jogue com seus amigos</h1>
        </div>
      </div>
      <p className="page-description">
        Crie uma sala para definir a partida ou entre usando um código de convite.
      </p>
      <div className="room-options">
        <Link className="room-option" to="/salas/criar">
          <span className="room-option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="room-option-copy">
            <span className="room-option-label">Nova partida</span>
            <strong>Criar sala</strong>
            <span className="room-option-description">Defina a dificuldade e convide seus amigos para jogar.</span>
          </span>
          <span className="room-option-arrow" aria-hidden="true">→</span>
        </Link>
        <Link className="room-option" to="/salas/entrar">
          <span className="room-option-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M13 5h6v14h-6M3 12h12m-5-5 5 5-5 5" />
            </svg>
          </span>
          <span className="room-option-copy">
            <span className="room-option-label">Tenho um código</span>
            <strong>Entrar em uma sala</strong>
            <span className="room-option-description">Informe o convite recebido de outro jogador.</span>
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
    <section className="page-card room-setup-card" aria-labelledby="room-setup-title">
      <div className="room-setup-heading">
        <span className="room-setup-icon" aria-hidden="true">
          {isCreate ? (
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M13 5h6v14h-6M3 12h12m-5-5 5 5-5 5" />
            </svg>
          )}
        </span>
        <div>
          <p className="eyebrow">Modo online</p>
          <h1 id="room-setup-title">{isCreate ? 'Criar sala' : 'Entrar em uma sala'}</h1>
        </div>
      </div>
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
          <fieldset className="difficulty-field room-setup-difficulty">
            <legend>Nível de dificuldade</legend>
            <div className="difficulty-options">
              {difficulties.map((option, index) => (
                <label className="difficulty-option" key={option.value}>
                  <input
                    checked={difficulty === option.value}
                    name="difficulty"
                    onChange={() => setDifficulty(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <span className="room-difficulty-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="room-difficulty-copy">
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </span>
                  <span className="room-difficulty-check" aria-hidden="true">
                    {difficulty === option.value && (
                      <svg viewBox="0 0 16 16" focusable="false">
                        <path d="m3 8 3.2 3.2L13 4.5" />
                      </svg>
                    )}
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
    <section className="page-card room-waiting room-waiting-card" aria-labelledby="room-waiting-title">
      <div className="room-waiting-heading">
        <span className="room-waiting-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8m1 3.2a5 5 0 0 1 3.5 4.5" />
          </svg>
        </span>
        <div>
          <p className="eyebrow">Sala de espera</p>
          <h1 id="room-waiting-title">Aguardando jogadores</h1>
        </div>
        {room?.status === 'waiting' && (
          <span className="room-waiting-status"><span />Em espera</span>
        )}
      </div>
      {isLoading && <p className="page-description">Carregando os dados da sala...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {room && (
        <>
          <p className="page-description room-waiting-description">
            Compartilhe o código para que seus amigos entrem. Os participantes aparecem aqui em tempo real.
          </p>
          <div className="room-waiting-grid">
            <div className="room-waiting-info">
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
            </div>
            <div className="player-list">
              <div className="player-list-header">
                <h2>Participantes</h2>
                <span className="player-count">{players.length}</span>
              </div>
              {players.map((player) => (
                <div className="player-row" key={player.user_id}>
                  <span className="player-avatar" aria-hidden="true">
                    {player.display_name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                  </span>
                  <span className="player-name">{player.display_name}</span>
                  {player.user_id === room.host_id && <span className="host-badge">Anfitrião</span>}
                </div>
              ))}
            </div>
          </div>
          {room.status === 'waiting' && isHost && (
            <div className="start-room-actions">
              <p className="field-hint">
                {players.length < 2
                  ? 'Aguarde a entrada de pelo menos mais um jogador.'
                  : 'Cada participante receberá uma palavra diferente, no mesmo nível de dificuldade.'}
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

function HangmanFigure({ errors }) {
  const parts = [
    <path d="M75 26h50M88 26l-7 12M112 26l7 12" key="hat" />,
    <circle cx="100" cy="61" key="head" r="20" />,
    <path d="M100 81v49" key="body" />,
    <path d="m100 91-25 25" key="left-arm" />,
    <path d="m100 91 25 25" key="right-arm" />,
    <path d="m100 130-23 27" key="left-leg" />,
    <path d="m100 130 23 27" key="right-leg" />,
    <circle cx="93" cy="59" key="left-eye" r="1.5" />,
    <circle cx="107" cy="59" key="right-eye" r="1.5" />,
    <path d="M94 69q6-5 12 0" key="mouth" />,
  ]

  return (
    <svg
      className="hangman-figure"
      viewBox="0 0 200 180"
      role="img"
      aria-label={`Forca com ${errors} de 10 erros`}
    >
      <path className="gallows" d="M35 165h130M55 165V20h90v10" />
      {parts.slice(0, errors).map((part) => (
        <g className="hangman-part" key={part.key}>{part}</g>
      ))}
    </svg>
  )
}

function RoundPage({ soundEnabled }) {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { setPendingScore } = useAuth()
  const [round, setRound] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [lastFeedback, setLastFeedback] = useState('')
  const [isPaused, setIsPaused] = useState(false)
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

          if (nextRound.status === 'in_progress') {
            setIsPaused(false)
            setLastFeedback((current) => (current ? '' : current))
          } else {
            setCountdown(0)
          }

          if (nextRound.status === 'won' || nextRound.status === 'lost') {
            setPendingScore((currentScore) => (
              currentScore?.roomId === roomId
                ? currentScore
                : {
                    roomId,
                    status: nextRound.status,
                    difficulty: nextRound.difficulty,
                    elapsedSeconds: nextRound.elapsed_seconds,
                    errors: nextRound.errors,
                  }
            ))
          }

          if (nextRound.status === 'lost' && nextRound.elapsed_seconds >= ROUND_TIME_LIMIT_SECONDS) {
            setLastFeedback('Tempo esgotado! A rodada terminou.')
          }
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
  }, [roomId, setPendingScore])

  const isRoundInProgress = round?.status === 'in_progress'

  useEffect(() => {
    if (!isRoundInProgress) {
      return undefined
    }

    const countdownTimer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(countdownTimer)
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(countdownTimer)
  }, [isRoundInProgress, round?.room_id])

  const isFinished = round?.status === 'won' || round?.status === 'lost'
  const isTimeExpired = round?.status === 'in_progress' && !isPaused && countdown === 0 && seconds >= ROUND_TIME_LIMIT_SECONDS
  const canGuess = round?.status === 'in_progress' && !isPaused && countdown === 0 && !isTimeExpired

  useEffect(() => {
    if (round?.status !== 'in_progress' || countdown > 0 || isPaused || isTimeExpired) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setSeconds((currentSeconds) => currentSeconds + 1)
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [countdown, isPaused, isTimeExpired, round?.status])

  async function handleGuess(letter) {
    if (!round || round.status !== 'in_progress' || isSubmitting || isPaused || countdown > 0) {
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const nextRound = await submitGuess(roomId, letter)
      setRound(nextRound)
      setSeconds(nextRound.elapsed_seconds)
      const isCorrect = Boolean(nextRound.letter_correct)
      setLastFeedback(isCorrect ? `Acertou: a letra ${letter} está na palavra.` : `Errou: a letra ${letter} não aparece.`)

      if (soundEnabled) {
        playTone({ enabled: true, frequency: isCorrect ? 660 : 200, duration: isCorrect ? 0.12 : 0.18, type: isCorrect ? 'triangle' : 'sawtooth' })
      }
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível registrar seu palpite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const elapsedLabel = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const timeRemainingLabel = `${String(Math.floor(Math.max(0, ROUND_TIME_LIMIT_SECONDS - seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, ROUND_TIME_LIMIT_SECONDS - seconds) % 60).padStart(2, '0')}`
  const guessedLetters = new Set([
    ...(round?.correct_letters ?? []),
    ...(round?.incorrect_letters ?? []),
  ])
  const isCountdownActive = round?.status === 'in_progress' && countdown > 0


  return (
    <section className="page-card round-card" aria-labelledby="round-title">
      <div className="round-header">
        <div>
          <p className="eyebrow">Partida em andamento</p>
          <h1 id="round-title">
            {round?.status === 'won' ? 'Você venceu!' : round?.status === 'lost' ? 'Você perdeu' : 'Descubra a palavra'}
          </h1>
        </div>
        {round && (
          <span className="round-difficulty">
            {difficulties.find(({ value }) => value === round.difficulty)?.label ?? round.difficulty}
          </span>
        )}
      </div>

      {isLoading && <p className="page-description">Carregando a rodada...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {round && (
        <>
          {isCountdownActive && (
            <div className="feature-notice" role="status">
              A rodada começa em {countdown}s
            </div>
          )}

          {isPaused && (
            <div className="feature-notice" role="status">
              Partida pausada. Retome quando quiser continuar.
            </div>
          )}

          {lastFeedback && !isCountdownActive && !isPaused && (
            <div className={`feedback-banner ${lastFeedback.includes('Acertou') ? 'feedback-correct' : 'feedback-incorrect'}`} role="status">
              {lastFeedback}
            </div>
          )}

          {isTimeExpired && (
            <div className="feature-notice" role="status">
              Tempo esgotado: a rodada encerrou por limite de tempo.
            </div>
          )}

          <div className="round-stats" role="group" aria-label="Resumo da partida">
            <div><span>Tempo</span><strong>{elapsedLabel}</strong></div>
            <div><span>Erros</span><strong>{round.errors}/{round.max_errors}</strong></div>
            <div><span>Tempo restante</span><strong>{timeRemainingLabel}</strong></div>
          </div>

          <div className="round-play-layout">
            <div className="round-visual-panel">
              <HangmanFigure errors={round.errors} />
              <div className="word-display" aria-label="Palavra oculta">
                {Array.from(round.masked_word ?? '').map((letter, index) => (
                  <span className="word-letter" key={`${index}-${letter}`}>
                    {letter === '_' ? '' : letter}
                  </span>
                ))}
              </div>
            </div>

            <div className="round-controls-panel">
              <div className="round-keyboard-heading">
                <h2>Escolha uma letra</h2>
                <span>{26 - guessedLetters.size} disponíveis</span>
              </div>
              <div className="letter-keyboard" aria-label="Teclado de letras">
                {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => {
                  const isGuessed = guessedLetters.has(letter)
                  const isCorrect = round.correct_letters?.includes(letter)

                  return (
                    <button
                      aria-label={`Letra ${letter}${isGuessed ? ' já utilizada' : ''}`}
                      className={`letter-key${isGuessed ? isCorrect ? ' correct' : ' incorrect' : ''}`}
                      disabled={isGuessed || !canGuess || isSubmitting}
                      key={letter}
                      onClick={() => void handleGuess(letter)}
                      type="button"
                    >
                      {letter}
                    </button>
                  )
                })}
              </div>
              <div className="round-actions">
                {round.status === 'in_progress' && (
                  <button
                    className="button button-secondary"
                    onClick={() => setIsPaused((current) => !current)}
                    type="button"
                  >
                    {isPaused ? 'Retomar partida' : 'Pausar partida'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {isFinished && (
            <RoundResultDialog
              continueLabel="Ver resultado"
              difficulty={round.difficulty}
              elapsedSeconds={round.elapsed_seconds}
              errors={round.errors}
              isWon={round.status === 'won'}
              onClose={() => navigate('/')}
              onContinue={() => navigate('/resultado')}
              word={round.revealed_word}
            />
          )}
        </>
      )}
    </section>
  )
}

function SoloSetupPage() {
  const navigate = useNavigate()
  const [difficulty, setDifficulty] = useState('easy')

  return (
    <section className="page-card solo-setup-card" aria-labelledby="solo-setup-title">
      <div className="solo-setup-heading">
        <span className="solo-setup-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <circle cx="8" cy="8" r="1" />
            <circle cx="16" cy="8" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="8" cy="16" r="1" />
            <circle cx="16" cy="16" r="1" />
          </svg>
        </span>
        <div>
          <p className="eyebrow">Jogo local</p>
          <h1 id="solo-setup-title">Jogar sozinho</h1>
        </div>
      </div>
      <p className="page-description">
        Escolha uma dificuldade e descubra a palavra antes de completar a forca ou o tempo acabar.
      </p>
      <fieldset className="difficulty-field solo-difficulty">
        <legend>Nível de dificuldade</legend>
        <div className="difficulty-options">
          {difficulties.map((option, index) => (
            <label className="difficulty-option" key={option.value}>
              <input
                checked={difficulty === option.value}
                name="solo-difficulty"
                onChange={() => setDifficulty(option.value)}
                type="radio"
                value={option.value}
              />
              <span className="solo-difficulty-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="solo-difficulty-copy">
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </span>
              <span className="solo-difficulty-check" aria-hidden="true">
                {difficulty === option.value && (
                  <svg viewBox="0 0 16 16" focusable="false">
                    <path d="m3 8 3.2 3.2L13 4.5" />
                  </svg>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="solo-setup-actions">
        <button
          className="button button-primary"
          onClick={() => navigate(`/solo/${difficulty}`)}
          type="button"
        >
          Iniciar partida
        </button>
        <Link className="button button-secondary" to="/salas">Jogar online</Link>
      </div>
    </section>
  )
}

function RoundResultDialog({
  difficulty,
  elapsedSeconds,
  errors,
  isWon,
  onClose,
  onContinue,
  continueLabel,
  word,
}) {
  const dialogRef = useRef(null)
  const score = calculateScore({ difficulty, elapsedSeconds, errors, won: isWon })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div className="round-result-overlay">
      <section
        aria-describedby="round-result-description"
        aria-labelledby="round-result-title"
        aria-modal="true"
        className={`round-result-dialog ${isWon ? 'won' : 'lost'}`}
        ref={dialogRef}
        role="dialog"
        tabIndex="-1"
      >
        <button
          aria-label="Voltar ao menu"
          className="round-result-close"
          onClick={onClose}
          type="button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <span className="round-result-icon" aria-hidden="true">
          {isWon ? (
            <svg viewBox="0 0 48 48" focusable="false">
              <path d="M16 8h16v7h6v4a8 8 0 0 1-8 8h-2v5h5v5H15v-5h5v-5h-2a8 8 0 0 1-8-8v-4h6V8Zm0 11h-2a4 4 0 0 0 4 4h1a14 14 0 0 1-3-4Zm16 0a14 14 0 0 1-3 4h1a4 4 0 0 0 4-4h-2Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 48 48" focusable="false">
              <path d="m16 16 16 16m0-16L16 32" />
            </svg>
          )}
        </span>
        <p className="eyebrow">Resultado da rodada</p>
        <h2 id="round-result-title">{isWon ? 'Você venceu!' : 'Você perdeu!'}</h2>
        <p className="round-result-label" id="round-result-description">A palavra era</p>
        <strong className="round-result-word">{word}</strong>
        <div className="round-result-stats">
          <div>
            <span>Tempo</span>
            <strong>{formatElapsedTime(elapsedSeconds)}</strong>
          </div>
          <div>
            <span>Erros</span>
            <strong>{errors}</strong>
          </div>
        </div>
        <p className="round-result-score">
          {isWon ? '+' : ''}{score} {score === 1 ? 'ponto' : 'pontos'}
        </p>
        <div className="round-result-actions">
          <button className="button button-primary" onClick={onContinue} type="button">
            {continueLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

function SoloRoundPage({ soundEnabled }) {
  const { difficulty } = useParams()
  const navigate = useNavigate()
  const { setPendingScore } = useAuth()
  const [round, setRound] = useState(() => (
    isSupportedDifficulty(difficulty) ? createRound(chooseWord(difficulty)) : null
  ))
  const [seconds, setSeconds] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [lastFeedback, setLastFeedback] = useState('')
  const roundRef = useRef(round)
  const secondsRef = useRef(0)
  const isTimeExpired = seconds >= ROUND_TIME_LIMIT_SECONDS

  const finishRound = useCallback((completedRound, elapsedSeconds) => {
    roundRef.current = completedRound
    setRound(completedRound)

    if (completedRound.status === 'won') {
      setPendingScore({
        roomId: `solo-${Date.now()}`,
        status: 'won',
        difficulty,
        elapsedSeconds,
        errors: completedRound.incorrectGuesses.length,
      })
    }
  }, [difficulty, setPendingScore])

  useEffect(() => {
    if (round?.status !== 'in_progress' || isPaused || isTimeExpired) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      const elapsedSeconds = Math.min(secondsRef.current + 1, ROUND_TIME_LIMIT_SECONDS)
      secondsRef.current = elapsedSeconds
      setSeconds(elapsedSeconds)

      if (elapsedSeconds === ROUND_TIME_LIMIT_SECONDS) {
        const expiredRound = expireRound(roundRef.current)
        if (expiredRound !== roundRef.current) {
          finishRound(expiredRound, elapsedSeconds)
          setLastFeedback('Tempo esgotado! A rodada terminou.')
        }
      }
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [finishRound, isPaused, isTimeExpired, round?.status])

  if (!round) {
    return (
      <section className="page-card">
        <p className="form-error" role="alert">Nível de dificuldade inválido.</p>
        <Link className="button button-primary" to="/solo">Escolher dificuldade</Link>
      </section>
    )
  }

  function handleGuess(letter) {
    if (round.status !== 'in_progress' || isPaused || seconds >= ROUND_TIME_LIMIT_SECONDS) {
      return
    }

    const nextRound = guessLetter(round, letter)
    if (nextRound === round) {
      return
    }

    if (nextRound.status === 'in_progress') {
      roundRef.current = nextRound
      setRound(nextRound)
    } else {
      finishRound(nextRound, seconds)
    }
    const isCorrect = nextRound.correctGuesses.includes(letter)
    setLastFeedback(isCorrect
      ? `Acertou: a letra ${letter} está na palavra.`
      : `Errou: a letra ${letter} não aparece.`)

    if (soundEnabled) {
      playTone({
        enabled: true,
        frequency: isCorrect ? 660 : 200,
        duration: isCorrect ? 0.12 : 0.18,
        type: isCorrect ? 'triangle' : 'sawtooth',
      })
    }
  }

  function startNewRound() {
    const nextRound = createRound(chooseWord(difficulty))
    roundRef.current = nextRound
    secondsRef.current = 0
    setRound(nextRound)
    setSeconds(0)
    setIsPaused(false)
    setLastFeedback('')
  }

  const displayRound = round
  const isFinished = displayRound.status !== 'in_progress'
  const isWon = displayRound.status === 'won'
  const feedback = lastFeedback
  const guessedLetters = new Set([...round.correctGuesses, ...round.incorrectGuesses])
  const maskedWord = Array.from(round.word, (letter) => (
    round.correctGuesses.includes(normalizeWord(letter)) ? letter : '_'
  )).join('')
  return (
    <section className="page-card round-card" aria-labelledby="solo-round-title">
      <div className="round-header">
        <div>
          <p className="eyebrow">Partida solo</p>
          <h1 id="solo-round-title">
            {displayRound.status === 'won' ? 'Você venceu!' : displayRound.status === 'lost' ? 'Fim da rodada' : 'Descubra a palavra'}
          </h1>
        </div>
        <span className="round-difficulty">
          {difficulties.find(({ value }) => value === difficulty)?.label ?? difficulty}
        </span>
      </div>
      {isPaused && <div className="feature-notice" role="status">Partida pausada.</div>}
      {feedback && !isPaused && (
        <div
          className={`feedback-banner ${feedback.startsWith('Acertou') ? 'feedback-correct' : 'feedback-incorrect'}`}
          role="status"
        >
          {feedback}
        </div>
      )}
      <div className="round-stats" role="group" aria-label="Resumo da partida">
        <div><span>Tempo</span><strong>{formatElapsedTime(seconds)}</strong></div>
        <div><span>Erros</span><strong>{round.incorrectGuesses.length}/{round.maxErrors}</strong></div>
        <div><span>Tempo restante</span><strong>{formatElapsedTime(Math.max(0, ROUND_TIME_LIMIT_SECONDS - seconds))}</strong></div>
      </div>
      <div className="round-play-layout">
        <div className="round-visual-panel">
          <HangmanFigure errors={round.incorrectGuesses.length} />
          <div className="word-display" aria-label="Palavra oculta">
            {Array.from(maskedWord).map((letter, index) => (
              <span className="word-letter" key={`${index}-${letter}`}>
                {letter === '_' ? '' : letter}
              </span>
            ))}
          </div>
        </div>

        <div className="round-controls-panel">
          <div className="round-keyboard-heading">
            <h2>Escolha uma letra</h2>
            <span>{26 - guessedLetters.size} disponíveis</span>
          </div>
          <div className="letter-keyboard" aria-label="Teclado de letras">
            {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((letter) => {
              const isGuessed = guessedLetters.has(letter)
              const isCorrect = round.correctGuesses.includes(letter)

              return (
                <button
                  aria-label={`Letra ${letter}${isGuessed ? ' já utilizada' : ''}`}
                  className={`letter-key${isGuessed ? isCorrect ? ' correct' : ' incorrect' : ''}`}
                  disabled={isGuessed || isFinished || isPaused || isTimeExpired}
                  key={letter}
                  onClick={() => handleGuess(letter)}
                  type="button"
                >
                  {letter}
                </button>
              )
            })}
          </div>
          {!isFinished && (
            <div className="round-actions">
              <button
                className="button button-secondary"
                onClick={() => setIsPaused((current) => !current)}
                type="button"
              >
                {isPaused ? 'Retomar partida' : 'Pausar partida'}
              </button>
            </div>
          )}
        </div>
      </div>
      {isFinished && (
        <RoundResultDialog
          continueLabel={isWon ? 'Ver resultado' : 'Jogar novamente'}
          difficulty={difficulty}
          elapsedSeconds={seconds}
          errors={round.incorrectGuesses.length}
          isWon={isWon}
          onClose={() => navigate('/')}
          onContinue={isWon ? () => navigate('/resultado') : startNewRound}
          word={round.word}
        />
      )}
    </section>
  )
}

function HomePage() {
  return (
    <section className="home-card" aria-labelledby="home-title">
      <div className="home-copy">
        <p className="eyebrow">Uma partida entre amigos</p>
        <h1 id="home-title">Jogo da <span>Forca</span></h1>
        <p className="page-description">
          Descubra a palavra, desafie seus amigos e tente terminar a rodada no menor tempo.
        </p>
        <div className="home-actions">
          <NavLink className="button button-primary" to="/solo">Jogar sozinho</NavLink>
          <NavLink className="button button-secondary" to="/salas">Jogar online</NavLink>
        </div>
        <div className="home-highlights" role="group" aria-label="Resumo das regras">
          <div><strong>01:30</strong><span>por rodada</span></div>
          <div><strong>10 erros</strong><span>disponíveis</span></div>
          <div><strong>4 níveis</strong><span>de dificuldade</span></div>
        </div>
        <NavLink className="home-ranking-link" to="/ranking">
          Veja o ranking e seus recordes <span aria-hidden="true">→</span>
        </NavLink>
      </div>

      <div className="home-preview" aria-hidden="true">
        <div className="home-preview-header">
          <span>Desafio da palavra</span>
          <span className="home-preview-badge">Sua vez</span>
        </div>
        <div className="home-preview-art">
          <HangmanFigure errors={2} />
        </div>
        <div className="home-preview-word">
          <span />
          <span />
          <span className="revealed" />
          <span />
          <span />
        </div>
        <div className="home-preview-keys">
          <span>A</span><span className="used">E</span><span>R</span><span>S</span><span>T</span><span>N</span><span>O</span>
        </div>
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

function AppLayout({ theme, setTheme, soundEnabled, setSoundEnabled }) {
  const { session } = useAuth()
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="Jogo da Forca — início">
          FORCA<span>.</span>
        </NavLink>
        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/salas">Jogar</NavLink>
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
        <Routes location={backgroundLocation ?? location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/solo" element={<SoloSetupPage />} />
          <Route path="/solo/:difficulty" element={<SoloRoundPage soundEnabled={soundEnabled} />} />
          <Route path="/salas" element={<RoomsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignUpPage />} />
          <Route path="/resultado" element={<ResultPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/conta" element={<ProtectedAccountRoute />} />
          <Route path="/configuracoes" element={<SettingsPage theme={theme} setTheme={setTheme} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} />} />
          <Route path="/salas/criar" element={<RoomSetupPage action="criar" />} />
          <Route path="/salas/entrar" element={<RoomSetupPage action="entrar" />} />
          <Route path="/salas/:roomId/jogo" element={<RoundPage soundEnabled={soundEnabled} />} />
          <Route path="/salas/:roomId" element={<RoomWaitingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        {backgroundLocation && (
          <Routes>
            <Route
              path="/configuracoes"
              element={(
                <SettingsPage
                  setSoundEnabled={setSoundEnabled}
                  setTheme={setTheme}
                  soundEnabled={soundEnabled}
                  theme={theme}
                />
              )}
            />
          </Routes>
        )}
      </main>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState(() => readStoredValue('forca-theme', 'dark'))
  const [soundEnabled, setSoundEnabled] = useState(() => readStoredValue('forca-sound', true))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    writeStoredValue('forca-theme', theme)
  }, [theme])

  useEffect(() => {
    writeStoredValue('forca-sound', soundEnabled)
  }, [soundEnabled])

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout
          setSoundEnabled={setSoundEnabled}
          setTheme={setTheme}
          soundEnabled={soundEnabled}
          theme={theme}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
