import React from 'react';

const items = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calls', label: 'Calls' },
  { id: 'settings', label: 'Settings' },
  { id: 'voices', label: 'Voices' }
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">AI Telemarketer</span>
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

