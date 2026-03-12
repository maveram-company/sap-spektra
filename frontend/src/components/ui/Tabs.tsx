import { useRef, useCallback } from 'react';

export default function Tabs({ tabs, activeTab, onChange, className = '' }) {
  const tabsRef = useRef([]);

  const handleKeyDown = useCallback((e) => {
    const currentIndex = tabs.findIndex(t => t.value === activeTab);
    let nextIndex = -1;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex >= 0) {
      e.preventDefault();
      onChange(tabs[nextIndex].value);
      tabsRef.current[nextIndex]?.focus();
    }
  }, [tabs, activeTab, onChange]);

  return (
    <div
      role="tablist"
      className={`flex gap-0 border-b border-border/30 ${className}`}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.value}
          ref={el => { tabsRef.current[i] = el; }}
          role="tab"
          aria-selected={activeTab === tab.value}
          tabIndex={activeTab === tab.value ? 0 : -1}
          onClick={() => onChange(tab.value)}
          className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 -mb-px ${
            activeTab === tab.value
              ? 'text-primary-400 border-b-2 border-primary-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]'
              : 'text-text-tertiary hover:text-text-secondary border-b-2 border-transparent'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              activeTab === tab.value
                ? 'bg-primary-500/20 text-primary-400'
                : 'bg-white/5 text-text-tertiary'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
