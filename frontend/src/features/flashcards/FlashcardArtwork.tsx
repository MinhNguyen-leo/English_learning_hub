import { useId } from 'react'

export function FlashcardArtwork() {
  const id = useId()
  return (
    <div className="fc-card-art" aria-hidden="true">
      <svg
        viewBox="0 0 1000 540"
        preserveAspectRatio="xMaxYMax slice"
        focusable="false"
      >
        <defs>
          <radialGradient id={`${id}-sphere`} cx="28%" cy="22%" r="80%">
            <stop offset="0" stopColor="#d9f2ff" />
            <stop offset="0.3" stopColor="#5fa9f3" />
            <stop offset="0.65" stopColor="#1c5cb4" />
            <stop offset="1" stopColor="#041a4d" />
          </radialGradient>
          <pattern
            id={`${id}-dots`}
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="#a5dcff" opacity="0.22" />
          </pattern>
        </defs>
        <rect width="1000" height="540" fill={`url(#${id}-dots)`} />
        <g fill="none" stroke="#8dcfff">
          <ellipse
            cx="840"
            cy="390"
            rx="300"
            ry="125"
            transform="rotate(-28 840 390)"
            opacity="0.17"
          />
          <ellipse
            cx="840"
            cy="390"
            rx="245"
            ry="95"
            transform="rotate(-28 840 390)"
            opacity="0.1"
            strokeDasharray="4 10"
          />
          <path d="M-40 400Q170 180 360 370T1050 100" opacity="0.08" />
          <path d="M-40 420Q170 200 360 390T1050 120" opacity="0.08" />
          <path
            d="M42 68V42H68M932 42H958V68M42 472V498H68M932 498H958V472"
            opacity="0.5"
          />
          <path
            d="M92 126H110M101 117V135M907 105H919M913 99V111M725 467H737M731 461V473"
            opacity="0.45"
          />
        </g>
        <g className="fc-art-sphere">
          <circle cx="865" cy="415" r="100" fill={`url(#${id}-sphere)`} />
          <g
            fill="none"
            stroke="#c2e6ff"
            strokeWidth="1.3"
            opacity="0.5"
            transform="rotate(-28 865 415)"
          >
            {[-80, -60, -40, -20, 0, 20, 40, 60, 80].map((offset) => (
              <ellipse
                key={offset}
                cx="865"
                cy={415 + offset}
                rx={Math.sqrt(10000 - offset * offset)}
                ry={Math.sqrt(10000 - offset * offset) * 0.22}
              />
            ))}
          </g>
        </g>
        <circle
          cx="690"
          cy="475"
          r="13"
          fill={`url(#${id}-sphere)`}
          opacity="0.8"
        />
        <circle cx="946" cy="233" r="7" fill="#bde6ff" opacity="0.6" />
        <circle cx="88" cy="300" r="3" fill="#8dcfff" opacity="0.45" />
      </svg>
    </div>
  )
}
