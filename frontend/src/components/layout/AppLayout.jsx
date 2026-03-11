import { Outlet } from 'react-router-dom';
import TopNav, { NAV_HEIGHT } from './TopNav';
import ChatWidget from '../ChatWidget';
import config from '../../config';

const DEMO_BANNER_HEIGHT = 28;

export default function AppLayout() {
  const showDemo = config.features.demoMode;
  const topOffset = showDemo ? DEMO_BANNER_HEIGHT : 0;

  return (
    <div className="min-h-screen bg-surface-secondary bg-grid">
      {/* Banner de modo demo */}
      {showDemo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: `${DEMO_BANNER_HEIGHT}px`,
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
          <span style={{ fontSize: '13px', opacity: 0.7 }}>{'\u2139\uFE0F'}</span>
          <span>Modo Demo — Datos simulados. Ningún sistema SAP real está conectado.</span>
        </div>
      )}

      <TopNav topOffset={topOffset} />
      <div style={{ paddingTop: `${NAV_HEIGHT + topOffset}px` }}>
        <Outlet />
      </div>
      <ChatWidget />
    </div>
  );
}
