import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import './App.css'

const pages = [
  { path: '/jogo', label: 'Jogo', title: 'Jogo', description: 'A partida e a mecânica da forca serão implementadas em uma próxima etapa.' },
  { path: '/resultado', label: 'Resultado', title: 'Resultado da partida', description: 'Os resultados da rodada aparecerão aqui.' },
  { path: '/ranking', label: 'Ranking', title: 'Ranking', description: 'Os melhores resultados serão consultados nesta página.' },
  { path: '/login', label: 'Entrar', title: 'Entrar', description: 'O formulário de login será implementado em uma próxima etapa.' },
  { path: '/cadastro', label: 'Criar conta', title: 'Criar conta', description: 'O formulário de cadastro será implementado em uma próxima etapa.' },
  { path: '/conta', label: 'Minha conta', title: 'Minha conta', description: 'A área autenticada será implementada em uma próxima etapa.' },
  { path: '/configuracoes', label: 'Configurações', title: 'Configurações', description: 'As preferências da partida serão implementadas junto às telas do jogo.' },
]

function PagePlaceholder({ title, description }) {
  return (
    <section className="page-card" aria-labelledby="page-title">
      <p className="eyebrow">Jogo da Forca</p>
      <h1 id="page-title">{title}</h1>
      <p className="page-description">{description}</p>
    </section>
  )
}

function RoomsPage() {
  return (
    <section className="page-card room-selection" aria-labelledby="rooms-title">
      <p className="eyebrow">Jogue com seus amigos</p>
      <h1 id="rooms-title">Criar ou entrar em uma sala</h1>
      <p className="page-description">
        Escolha como deseja participar. As salas online serão conectadas ao Supabase Realtime
        em uma próxima etapa.
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

  return (
    <section className="page-card" aria-labelledby="room-setup-title">
      <p className="eyebrow">Salas online</p>
      <h1 id="room-setup-title">{isCreate ? 'Criar sala' : 'Entrar em uma sala'}</h1>
      <p className="page-description">
        {isCreate
          ? 'A configuração da dificuldade, o código de convite e a sala de espera serão conectados ao Supabase Realtime.'
          : 'A validação do código e a entrada na sala serão conectadas ao Supabase Realtime.'}
      </p>
      <p className="feature-notice">
        Esta etapa prepara a navegação. A criação e a entrada em salas reais serão implementadas
        depois da configuração segura do Supabase.
      </p>
      <Link className="button button-primary" to="/salas">Voltar às opções de sala</Link>
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
      <div className="home-actions">
        <NavLink className="button button-primary" to="/salas">Iniciar jogo</NavLink>
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
  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="Jogo da Forca — início">
          FORCA<span>.</span>
        </NavLink>
        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/salas">Jogar</NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          <NavLink to="/login">Entrar</NavLink>
          <NavLink to="/configuracoes" aria-label="Configurações">Configurações</NavLink>
        </nav>
      </header>

      <main className="page-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/salas" element={<RoomsPage />} />
          <Route path="/salas/criar" element={<RoomSetupPage action="criar" />} />
          <Route path="/salas/entrar" element={<RoomSetupPage action="entrar" />} />
          {pages.map(({ path, title, description }) => (
            <Route
              key={path}
              path={path}
              element={<PagePlaceholder title={title} description={description} />}
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App
