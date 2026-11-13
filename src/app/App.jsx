import { useEffect, useState } from 'react'
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
} from '../features/game/gameRules.js'
import { isValidOtpCode, normalizeOtpCode } from '../features/auth/otp.js'
import { gameModeOptions } from '../features/game/gameModes.js'
import {
  playGameStartSound,
  playGuessSound,
  playRoundEndSound,
  playSoundEffect,
  startBackgroundMusic,
  stopBackgroundMusic,
} from '../features/settings/audio.js'
import './App.css'

const settingsStorageKey = 'forca-settings'
const defaultSettings = {
  soundEffects: true,
  backgroundMusic: true,
  theme: 'purple',
}
const themeOptions = [
  { value: 'light', label: 'Claro', color: '#f5f6ff' },
  { value: 'purple', label: 'Roxo', color: '#8b45f5' },
]

const difficulties = [
  { value: 'easy', label: 'Fácil', detail: '3 a 5 letras' },
  { value: 'medium', label: 'Médio', detail: '6 a 8 letras' },
  { value: 'hard', label: 'Difícil', detail: '9 a 12 letras' },
  { value: 'expert', label: 'Expert', detail: '14 letras ou mais' },
]

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

function ResultPage() {
  const { pendingScore, session, setPendingScore } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const isRegisteredUser = Boolean(session?.user && !session.user.is_anonymous)
  const displayName = session?.user?.user_metadata?.display_name || 'Jogador'

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

        const payload = {
          displayName,
          difficulty: pendingScore.difficulty,
          elapsedSeconds: pendingScore.elapsedSeconds,
          errors: pendingScore.errors,
        }

        return pendingScore.roomId
          ? saveRoomResult({
              roomId: pendingScore.roomId,
              ...payload,
            })
          : saveBestResult(payload)
      })
      .then((isNewRecord) => {
        if (!active || typeof isNewRecord !== 'boolean') {
          return
        }

        setNotice(isNewRecord
          ? 'Resultado registrado. Seu recorde foi atualizado!'
          : 'Resultado recebido. Seu recorde anterior continua valendo.')
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
    <section className="page-card" aria-labelledby="result-title">
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
      {error && <p className="form-error" role="alert">{error}</p>}
      <Link className="button button-secondary" to="/ranking">Ver ranking</Link>
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
  const { completeSignUp, pendingScore, requestSignUpCode, verifySignUpCode } = useAuth()
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
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
    setNotice('')

    if (name === 'displayName' || name === 'email') {
      setOtpSent(false)
      setOtpCode('')
    }
  }

  async function handleSendCode() {
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
      await requestSignUpCode({ email: validation.data.email })
      setOtpSent(true)
      setNotice('Código enviado para o seu e-mail. Digite-o abaixo para concluir o cadastro.')
    } catch (error) {
      setFormError(error.message || 'Não foi possível enviar o código.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyCode(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')

    if (!isValidOtpCode(otpCode)) {
      setFormError('Informe o código de 6 dígitos enviado para o seu e-mail.')
      return
    }

    setOtpVerifying(true)

    try {
      const { email, displayName, password } = values
      const verification = await verifySignUpCode({ email, token: otpCode.trim() })

      if (!verification.session) {
        throw new Error('O código foi validado, mas a sessão não foi criada.')
      }

      await completeSignUp({ displayName, password })
      setNotice('Cadastro concluído com sucesso!')
      navigate(pendingScore ? '/resultado' : '/conta', { replace: true })
    } catch (error) {
      setFormError(error.message || 'Não foi possível confirmar o código.')
    } finally {
      setOtpVerifying(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (otpSent) {
      await handleVerifyCode(event)
      return
    }

    await handleSendCode()
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
        {!otpSent && (
          <>
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
        {otpSent && (
          <div className="otp-panel" aria-live="polite">
            <span className="otp-badge">Verificação de e-mail</span>
            <p>
              Enviamos um código para <strong>{values.email}</strong>.
              Digite os 6 números abaixo para concluir o cadastro.
            </p>
            <AuthField
              autoComplete="one-time-code"
              error={fieldErrors.otpCode}
              id="signup-otp"
              inputMode="numeric"
              label="Código do e-mail"
              maxLength={6}
              name="otpCode"
              onChange={(event) => setOtpCode(normalizeOtpCode(event.target.value))}
              type="text"
              value={otpCode}
            />
          </div>
        )}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {notice && <p className="feature-notice" role="status">{notice}</p>}
        <button className="button button-primary" disabled={isSubmitting || otpVerifying} type="submit">
          {isSubmitting
            ? 'Enviando código...'
            : otpVerifying
              ? 'Confirmando...'
              : otpSent
                ? 'Confirmar código'
                : 'Enviar código'}
        </button>
        {otpSent && (
          <button
            className="button button-secondary"
            disabled={isSubmitting || otpVerifying}
            onClick={handleSendCode}
            type="button"
          >
            Reenviar código
          </button>
        )}
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

function HangmanFigure({ errors }) {
  const parts = [
    <circle cx="174" cy="91" r="19" key="head" />,
    <path d="M174 110v49" key="body" />,
    <path d="m174 121-25 25" key="left-arm" />,
    <path d="m174 121 25 25" key="right-arm" />,
    <path d="m174 159-23 29" key="left-leg" />,
    <path d="m174 159 23 29" key="right-leg" />,
  ]

  return (
    <svg className="hangman-figure" viewBox="0 0 260 230" role="img"
      aria-label={`Forca de madeira com ${errors} erros`}>
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a85c0b" />
          <stop offset=".45" stopColor="#d18a20" />
          <stop offset="1" stopColor="#a85c0b" />
        </linearGradient>
      </defs>
      <path d="M24 218H235" stroke="#55505a" strokeWidth="9" strokeLinecap="round" />
      <path d="M66 215V18h25v197zM66 18h170v25H66zM89 100l74-82h28l-102 111z"
        fill="url(#wood)" stroke="#8b4b08" strokeWidth="2" strokeLinejoin="round" />
      <path d="M66 18h25M91 43h145" stroke="#e2a13b" strokeWidth="3" opacity=".55" />
      <path d="M174 43v32" stroke="#f8bd39" strokeWidth="7" strokeLinecap="round" />
      <path d="M174 74c-23 12-24 39 0 52 24-13 23-40 0-52z"
        fill="none" stroke="#f8bd39" strokeWidth="7" strokeLinecap="round" />
      <path d="M164 68q10 8 20 0M164 75q10 8 20 0"
        fill="none" stroke="#f8bd39" strokeWidth="6" strokeLinecap="round" />
      {parts.slice(0, errors).map((part) => (
        <g className="hangman-part" key={part.key}>{part}</g>
      ))}
    </svg>
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

    setIsSubmitting(true)
    setError('')

    try {
      const nextRound = await submitGuess(roomId, letter)
      setRound(nextRound)
      setSeconds(nextRound.elapsed_seconds)
      if (soundEffectsEnabled) {
        playGuessSound(nextRound.correct_letters.includes(letter))
        if (nextRound.status !== round.status) {
          playRoundEndSound(nextRound.status)
        }
      }
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível registrar seu palpite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const elapsedLabel = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const guessedLetters = new Set([
    ...(round?.correct_letters ?? []),
    ...(round?.incorrect_letters ?? []),
  ])
  const isFinished = round?.status === 'won' || round?.status === 'lost'

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

  return (
    <section className="page-card round-card" aria-labelledby="round-title">
      <p className="eyebrow">Partida em andamento</p>
      <h1 id="round-title">
        {round?.status === 'won' ? 'Você venceu!' : round?.status === 'lost' ? 'Você perdeu' : 'Descubra a palavra'}
      </h1>

      {isLoading && <p className="page-description">Carregando a rodada...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {round && (
        <>
          <div className="round-stats">
            <div><span>Tempo</span><strong>{elapsedLabel}</strong></div>
            <div><span>Erros</span><strong>{round.errors}/{round.max_errors}</strong></div>
            <div><span>Nível</span><strong>{difficulties.find(({ value }) => value === round.difficulty)?.label}</strong></div>
          </div>

          <HangmanFigure errors={round.errors} />

          <div className="word-display" aria-label="Palavra oculta">
            {Array.from(round.masked_word ?? '').map((letter, index) => (
              <span className="word-letter" key={`${index}-${letter}`}>
                {letter === '_' ? '' : letter}
              </span>
            ))}
          </div>

          {isFinished && (
            <div className={`round-result ${round.status}`} role="status">
              <strong>{round.status === 'won' ? 'Parabéns!' : 'Fim da rodada'}</strong>
              <span>A palavra era <b>{round.revealed_word}</b>.</span>
              <span>Seu tempo: {elapsedLabel} · Erros: {round.errors}</span>
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
            <button
              className="button button-primary"
              onClick={() => navigate('/salas')}
              type="button"
            >
              Ver resultado
            </button>
          )}
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

  const [difficulty, setDifficulty] = useState('easy')
  const [round, setRound] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function startNewGame(nextDifficulty = difficulty) {
    setRound(createSoloRound(nextDifficulty))
    setSeconds(0)
    setError('')
    setIsSubmitting(false)
    if (soundEffectsEnabled) {
      playGameStartSound()
    }
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

    setIsSubmitting(true)
    setError('')

    try {
      const nextRound = guessLetter(round, letter)
      setRound(nextRound)
      if (soundEffectsEnabled) {
        playGuessSound(nextRound.correctGuesses.includes(letter))
        if (nextRound.status !== round.status) {
          playRoundEndSound(nextRound.status)
        }
      }
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível registrar seu palpite.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const elapsedLabel = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const guessedLetters = new Set([
    ...(round?.correctGuesses ?? []),
    ...(round?.incorrectGuesses ?? []),
  ])
  const isFinished = round?.status === 'won' || round?.status === 'lost'

  return (
    <section className="page-card round-card" aria-labelledby={`${modeLabel}-title`}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 id={`${modeLabel}-title`}>{heading}</h1>

      {!round && (
        <div className="room-form" style={{ gap: '1.25rem' }}>
          <div className="difficulty-picker">
            <label className="form-field" htmlFor={`${modeLabel}-difficulty`}>
              <span>Escolha o nível antes de iniciar a partida</span>
              <select
                id={`${modeLabel}-difficulty`}
                onChange={(event) => {
                  const nextDifficulty = event.target.value
                  setDifficulty(nextDifficulty)
                }}
                value={difficulty}
              >
                {difficulties.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
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
          <svg className="hangman-figure" viewBox="0 0 200 180" role="img" aria-label={`Forca com ${round.incorrectGuesses.length} de ${MAX_ERRORS} erros`}>
            <g className="wooden-gallows">
        <rect x="34" y="158" width="132" height="10" rx="4" className="wood-base" />
        <rect x="48" y="18" width="18" height="142" rx="2" className="wood-post" />
        <rect x="48" y="18" width="112" height="18" rx="2" className="wood-beam" />
        <path d="M64 76 L104 36 L88 36 L64 60 Z" className="wood-brace" />
        <path d="M48 18h18v142H48z" className="wood-highlight" />
        <circle cx="57" cy="27" r="2" className="wood-nail" />
        <circle cx="151" cy="27" r="2" className="wood-nail" />
      </g>
            {[
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
            ].slice(0, round.incorrectGuesses.length).map((part) => (
              <g className="hangman-part" key={part.key}>{part}</g>
            ))}
          </svg>

          <div className="round-game-panel">
            <div className="round-stats">
              <div><span>Tempo</span><strong>{elapsedLabel}</strong></div>
              <div><span>Erros</span><strong>{round.incorrectGuesses.length}/{MAX_ERRORS}</strong></div>
              <div><span>Nível</span><strong>{difficulties.find(({ value }) => value === difficulty)?.label}</strong></div>
            </div>

            <div className="word-display" aria-label="Palavra oculta">
              {Array.from(round.word ?? '').map((letter, index) => (
                <span className="word-letter" key={`${index}-${letter}`}>
                  {round.correctGuesses.includes(letter) ? letter : ''}
                </span>
              ))}
            </div>

            {isFinished && (
              <div className={`round-result ${round.status}`} role="status">
                <strong>{round.status === 'won' ? 'Parabéns!' : 'Fim da rodada'}</strong>
                <span>A palavra era <b>{round.word}</b>.</span>
                <span>Seu tempo: {elapsedLabel} · Erros: {round.incorrectGuesses.length}</span>
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
              <NavLink className="button button-secondary" to="/">Voltar ao início</NavLink>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function IndividualGamePage({ soundEffectsEnabled }) {
  return <SoloGamePage mode="individual" soundEffectsEnabled={soundEffectsEnabled} />
}

function HomePage() {
  return (
    <section className="home-card" aria-labelledby="home-title">
      <p className="eyebrow">Escolha o modo da partida</p>
      <h1 id="home-title">Jogo da <span>Forca</span></h1>
      <p className="page-description">
        Primeiro escolha como deseja jogar. Depois selecione o nível e comece a partida.
      </p>
      <div className="home-actions">
        <NavLink className="button button-primary" to={gameModeOptions[0].to}>{gameModeOptions[0].label}</NavLink>
        <NavLink className="button button-secondary" to="/salas">Jogar com amigos</NavLink>
        <NavLink className="button button-secondary" to="/ranking">Ver ranking</NavLink>
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
    <div className="app-shell" onClickCapture={handleAppClick}>
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
          <Route path="/individual" element={<IndividualGamePage soundEffectsEnabled={settings.soundEffects} />} />
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
