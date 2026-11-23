import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getRoomResults, getRoomSnapshot, isRoomHost, replayRoom, subscribeToRoom } from '../../features/rooms/roomService.js'

function formatElapsedTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`
}

export default function RoomResultPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [difficulty, setDifficulty] = useState('easy')
  const [isReplaying, setIsReplaying] = useState(false)

  useEffect(() => {
    let active = true

    Promise.all([getRoomResults(roomId), isRoomHost(roomId)])
      .then(([entries, host]) => {
        if (active) {
          setResults(entries)
          setIsHost(host)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || 'Não foi possível carregar o placar da sala.')
        }
      })

    return () => {
      active = false
    }
  }, [roomId])

  useEffect(() => {
    let active = true

    async function checkForReplay() {
      try {
        const snapshot = await getRoomSnapshot(roomId)
        if (active && snapshot.room.status === 'in_progress') {
          navigate(`/salas/${roomId}/jogo`, { replace: true })
        }
      } catch {
        // Mantém o polling/realtime ativo até o status da sala ficar disponível.
      }
    }

    void checkForReplay()
    const replayInterval = window.setInterval(checkForReplay, 1000)

    const unsubscribe = subscribeToRoom(roomId, {
      onRoomChange: () => void checkForReplay(),
      onPlayersChange: () => {},
      onRoundChange: () => void checkForReplay(),
      onError: () => {},
    })

    return () => {
      active = false
      window.clearInterval(replayInterval)
      unsubscribe()
    }
  }, [navigate, roomId])

  async function handleReplay() {
    setIsReplaying(true)
    setError('')

    try {
      await replayRoom(roomId, difficulty)
      navigate(`/salas/${roomId}/jogo`, { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível jogar novamente.')
      setIsReplaying(false)
    }
  }

  return (
    <section className="page-card ranking-page" aria-labelledby="room-result-title">
      <p className="eyebrow">Partida finalizada</p>
      <h1 id="room-result-title">Ranking da sala</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!results && !error && <p className="page-description">Carregando placar...</p>}
      {results && (
        <div className="ranking-group">
          <h2>Placar dos jogadores</h2>
          {results.length === 0 ? (
            <p className="ranking-empty">Ainda não há resultados nesta sala.</p>
          ) : (
            <ol className="ranking-list">
              {results.map((entry, index) => (
                <li className="ranking-row" key={`${entry.user_id}-${index}`}>
                  <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                  <strong>
                    {entry.display_name}
                    {entry.status === 'won' ? ' · Venceu' : entry.status === 'lost' ? ' · Perdeu' : ' · Jogando'}
                  </strong>
                  <span className="ranking-score">
                    {entry.status === 'in_progress'
                      ? 'Partida em andamento'
                      : `${formatElapsedTime(entry.elapsed_seconds)} · ${entry.errors} erros`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {isHost && (
        <div className="room-form">
          <label className="form-field" htmlFor="replay-difficulty">
            <span>Novo nível da partida</span>
            <select
              id="replay-difficulty"
              onChange={(event) => setDifficulty(event.target.value)}
              value={difficulty}
            >
              <option value="easy">Fácil</option>
              <option value="medium">Médio</option>
              <option value="hard">Difícil</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={isReplaying}
            onClick={handleReplay}
            type="button"
          >
            {isReplaying ? 'Iniciando...' : 'Jogar novamente'}
          </button>
        </div>
      )}

      <div className="home-actions">
        <Link className="button button-primary" to="/salas">Nova sala</Link>
      </div>
    </section>
  )
}
