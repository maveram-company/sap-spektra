import { Outlet } from 'react-router-dom';
import TopNav, { NAV_HEIGHT } from './TopNav';
import ChatWidget from '../ChatWidget';
import ModeIndicator from '../../mode/ModeIndicator';
import { useMode } from '../../mode/ModeContext';

const MODE_BANNER_HEIGHT = 28;

export default function AppLayout() {
  const { state } = useMode();
  const showModeBanner = state.mode === 'MOCK' || state.mode === 'FALLBACK';
  const topOffset = showModeBanner ? MODE_BANNER_HEIGHT : 0;

  const bannerLabels: Record<string, string> = {
    MOCK: 'Modo Demo — Datos simulados. Ningún sistema SAP real está conectado.',
    FALLBACK: 'Modo Fallback — Se intentará conectar al backend; en caso de fallo se usan datos simulados.',
  };

  return (
    <div className="min-h-screen bg-surface-secondary bg-grid">
      {/* Skip to main content link — visible solo al hacer focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[70] focus:px-4 focus:py-2 focus:bg-primary-500 focus:text-white focus:rounded-lg"
      >
        Ir al contenido principal
      </a>

      {/* Mode banner */}
      {showModeBanner && (
        <div
          role="banner"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: `${MODE_BANNER_HEIGHT}px`,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: 'rgba(30, 41, 89, 0.92)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(99, 102, 241, 0.25)',
            fontSize: '12px',
            color: 'rgba(199, 210, 254, 0.85)',
            letterSpacing: '0.02em',
          }}
        >
          <ModeIndicator />
          <span>{bannerLabels[state.mode] || ''}</span>
        </div>
      )}

      <header>
        <TopNav topOffset={topOffset} />
      </header>
      <main id="main-content" style={{ paddingTop: `${NAV_HEIGHT + topOffset}px` }}>
        <Outlet />
      </main>
      <ChatWidget />
    </div>
  );
}
