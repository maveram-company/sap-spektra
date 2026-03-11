import { Outlet } from 'react-router-dom';
import TopNav, { NAV_HEIGHT } from './TopNav';
import ChatWidget from '../ChatWidget';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-secondary bg-grid">
      <TopNav />
      <div style={{ paddingTop: `${NAV_HEIGHT}px` }}>
        <Outlet />
      </div>
      <ChatWidget />
    </div>
  );
}
