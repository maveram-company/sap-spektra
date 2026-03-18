export default function HealthGauge({ score = 0, size = 120, strokeWidth = 8 }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI;
  const progress = (clampedScore / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 90) return '#22c55e';
    if (s >= 70) return '#f59e0b';
    if (s >= 50) return '#f97316';
    return '#ef4444';
  };

  const getLabel = (s: number) => {
    if (s >= 90) return 'Saludable';
    if (s >= 70) return 'Advertencia';
    if (s >= 50) return 'Degradado';
    return 'Crítico';
  };

  const getGlowConfig = (s: number) => {
    if (s >= 90) return { color: '#22c55e', stdDeviation: 4, animate: false };
    if (s >= 70) return { color: '#f59e0b', stdDeviation: 4, animate: false };
    if (s >= 50) return { color: '#f97316', stdDeviation: 5, animate: false };
    return { color: '#ef4444', stdDeviation: 6, animate: true };
  };

  const color = getColor(clampedScore);
  const glow = getGlowConfig(clampedScore);
  const filterId = `health-glow-${Math.round(clampedScore)}`;

  return (
    <div className="relative inline-flex items-center justify-center" role="img" aria-label={`Health score: ${clampedScore} de 100 — ${getLabel(clampedScore)}`}>
      <svg width={size} height={size / 1.5} viewBox={`0 0 ${size} ${size / 1.5}`} aria-hidden="true">
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glow.stdDeviation} result="blur" />
            <feFlood floodColor={glow.color} floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 1.5 - strokeWidth / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 1.5 - strokeWidth / 2}`}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Progress arc with glow filter */}
        <path
          d={`M ${strokeWidth / 2} ${size / 1.5 - strokeWidth / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 1.5 - strokeWidth / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          filter={`url(#${filterId})`}
          style={{ transition: 'stroke-dasharray 0.8s ease-in-out' }}
        >
          {glow.animate && (
            <animate
              attributeName="opacity"
              values="1;0.5;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          )}
        </path>
      </svg>

      <div className="absolute bottom-0 text-center">
        <span className="text-2xl font-bold" style={{ color }}>{clampedScore}</span>
        <span className="text-xs text-text-tertiary block -mt-1">Health</span>
      </div>
    </div>
  );
}
