import { MAX_ERRORS } from '../../features/game/gameRules.js'

const HANGMAN_PART_COUNT = 10
const confettiColors = ['#f2bd4b', '#7fd36b', '#f29bc6', '#b685ff', '#ff9a3c', '#8fd3ff']

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

export { HangmanStage }
