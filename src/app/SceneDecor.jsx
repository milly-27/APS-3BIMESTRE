const leafPositions = [
  [14, 40, -30], [30, 86, 25], [12, 140, -35], [34, 190, 20], [14, 244, -30],
  [32, 296, 25], [12, 350, -35], [30, 400, 20], [14, 450, -28],
]

function Vine({ flip = false }) {
  return (
    <svg
      className={`decor-vine${flip ? ' flip' : ''}`}
      viewBox="0 0 60 480"
      preserveAspectRatio="xMinYMin meet"
    >
      <path
        d="M8 0C30 50 -6 90 22 140s-16 90 8 150-14 80 6 190"
        fill="none"
        stroke="#2c4a22"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {leafPositions.map(([x, y, r], index) => (
        <ellipse
          cx={x}
          cy={y}
          fill={index % 3 === 0 ? '#4f7a32' : index % 3 === 1 ? '#3b6128' : '#5e8a3a'}
          key={y}
          rx="15"
          ry="7"
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
      {[[24, 112], [20, 322], [26, 232]].map(([x, y], index) => (
        <g key={y} transform={`translate(${x} ${y})`}>
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse
              cx="0"
              cy="-6"
              fill={index === 1 ? '#f2a6c8' : '#c9a2ff'}
              key={angle}
              rx="3.6"
              ry="6"
              transform={`rotate(${angle})`}
            />
          ))}
          <circle r="3" fill="#ffd978" />
        </g>
      ))}
    </svg>
  )
}

function Mushroom({ className = '', cap = '#c8405f' }) {
  return (
    <svg className={`decor-mushroom ${className}`} viewBox="0 0 90 80">
      <rect x="34" y="38" width="22" height="36" rx="10" fill="#f0e2c0" />
      <rect x="34" y="38" width="22" height="9" fill="#00000022" />
      <path d="M6 44C6 12 84 12 84 44c0 5-12 7-39 7S6 49 6 44Z" fill={cap} />
      <circle cx="28" cy="32" r="5" fill="#fff6dd" opacity=".9" />
      <circle cx="52" cy="26" r="4" fill="#fff6dd" opacity=".9" />
      <circle cx="68" cy="37" r="3.5" fill="#fff6dd" opacity=".9" />
    </svg>
  )
}

function Crystals({ className = '' }) {
  return (
    <svg className={`decor-crystals ${className}`} viewBox="0 0 120 150">
      <defs>
        <linearGradient id={`cg-${className || 'a'}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e3c8ff" />
          <stop offset=".5" stopColor="#9a5be0" />
          <stop offset="1" stopColor="#4b2a88" />
        </linearGradient>
      </defs>
      <path d="M52 148 36 40 56 4l22 38-10 106Z" fill={`url(#cg-${className || 'a'})`} />
      <path d="M56 4 78 42 68 148 56 60Z" fill="#ffffff2e" />
      <path d="M26 148 8 84 24 58l18 28 2 62Z" fill="#d37fc9" />
      <path d="M24 58 42 86l2 62-14-50Z" fill="#ffffff30" />
      <path d="M84 148 80 92l16-26 18 30-4 52Z" fill="#7a46c8" />
      <path d="M96 66l18 30-4 52-12-60Z" fill="#ffffff2a" />
    </svg>
  )
}

function Lantern({ className = '' }) {
  return (
    <div className={`decor-lantern ${className}`}>
      <svg viewBox="0 0 50 110">
        <path d="M25 0v26" stroke="#6b4a2a" strokeWidth="3" />
        <path d="M14 30h22l-3-8H17Z" fill="#3d2a18" />
        <rect x="12" y="30" width="26" height="42" rx="5" fill="#ffb347" opacity=".92" />
        <rect x="12" y="30" width="26" height="42" rx="5" fill="none" stroke="#3d2a18" strokeWidth="3" />
        <path d="M25 30v42M12 51h26" stroke="#3d2a18" strokeWidth="2" />
        <path d="M13 74h24l-4 8H17Z" fill="#3d2a18" />
        <ellipse cx="25" cy="54" rx="6" ry="9" fill="#fff0b8" />
      </svg>
    </div>
  )
}

export default function SceneDecor() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-light scene-light-a" />
      <div className="scene-light scene-light-b" />
      <Vine />
      <Vine flip />
      <Lantern className="lantern-left" />
      <Lantern className="lantern-right" />
      <Mushroom className="mush-a" />
      <Mushroom cap="#a85fd8" className="mush-b" />
      <Mushroom cap="#e07a5f" className="mush-c" />
      <Crystals className="crystals-left" />
      <Crystals className="crystals-right" />
      <div className="fireflies">
        {Array.from({ length: 14 }, (_, index) => (
          <span key={index} style={{ '--i': index }} />
        ))}
      </div>
    </div>
  )
}
