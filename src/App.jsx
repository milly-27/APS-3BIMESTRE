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
  return (
    <section className="page-card" aria-labelledby="settings-title">
      <p className="eyebrow">Configurações</p>
      <h1 id="settings-title">Preferências do jogo</h1>
      <p className="page-description">
        Ajuste o tema visual e os efeitos sonoros do jogo para a sua experiência.
      </p>

      <div className="settings-list">
        <div className="settings-item">
          <div>
            <strong>Tema visual</strong>
            <span>{theme === 'dark' ? 'Escuro' : 'Claro'}</span>
          </div>
          <button
            className="button button-secondary"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            type="button"
          >
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>
        </div>

        <div className="settings-item">
          <div>
            <strong>Efeitos sonoros</strong>
            <span>{soundEnabled ? 'Ativados' : 'Desativados'}</span>
          </div>
          <button
            className="button button-secondary"
            onClick={() => setSoundEnabled((current) => !current)}
            type="button"
          >
            {soundEnabled ? 'Desativar som' : 'Ativar som'}
          </button>
        </div>
      </div>

      <Link className="text-link" to="/">Voltar ao início</Link>
    </section>
  )
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
  const achievements = getAchievementList(pendingScore)

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
      {achievements.length > 0 && (
        <div className="achievement-box" aria-label="Conquistas obtidas">
          <h2>Conquistas</h2>
          <ul>
            {achievements.map((achievement) => (
              <li key={achievement.id}>
                <strong>{achievement.title}</strong>
                <span>{achievement.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="action-row">
        <Link className="button button-primary" to="/salas">Jogar novamente</Link>
        <Link className="button button-secondary" to="/ranking">Ver ranking</Link>
        <Link className="button button-secondary" to="/">Voltar ao menu</Link>
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
            Compartilhe o código com seus amigos. A sala aceita dois ou mais jogadores simultaneamente, e a lista de participantes atualiza em tempo real.
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
            setCountdown(3)
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
      <p className="eyebrow">Partida em andamento</p>
      <h1 id="round-title">
        {round?.status === 'won' ? 'Você venceu!' : round?.status === 'lost' ? 'Você perdeu' : 'Descubra a palavra'}
      </h1>

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

          <div className="round-stats">
            <div><span>Tempo</span><strong>{elapsedLabel}</strong></div>
            <div><span>Erros</span><strong>{round.errors}/{round.max_errors}</strong></div>
            <div><span>Restante</span><strong>{timeRemainingLabel}</strong></div>
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

          {isFinished && (
            <div className="action-row">
              <button
                className="button button-primary"
                onClick={() => navigate('/resultado')}
                type="button"
              >
                Ver resultado
              </button>
              <button
                className="button button-secondary"
                onClick={() => navigate('/salas')}
                type="button"
              >
                Jogar novamente
              </button>
              <button
                className="button button-secondary"
                onClick={() => navigate('/')}
                type="button"
              >
                Voltar ao menu
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function HomePage() {
  return (
    <section className="home-card" aria-labelledby="home-title">
      <p className="eyebrow">Uma partida entre amigos</p>
      <h1 id="home-title">Jogo da <span>Forca</span></h1>
      <p className="page-description">
        Descubra a palavra, desafie seus amigos e tente terminar a rodada no menor tempo.
      </p>
      <ul className="home-instructions" aria-label="Instruções básicas do jogo">
        <li>Crie ou entre em uma sala com um código.</li>
        <li>Escolha o nível de dificuldade antes de iniciar.</li>
        <li>Tente adivinhar a palavra antes que o tempo ou os erros acabem.</li>
        <li>Acompanhe a pontuação e o ranking ao final da partida.</li>
      </ul>
      <div className="home-actions">
        <NavLink className="button button-primary" to="/salas">Iniciar jogo</NavLink>
        <NavLink className="button button-secondary" to="/ranking">Ranking</NavLink>
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
          <NavLink to="/configuracoes" aria-label="Configurações">Configurações</NavLink>
        </nav>
      </header>

      <main className="page-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
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
