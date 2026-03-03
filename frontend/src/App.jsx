import React, { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './sections/Dashboard.jsx';
import Calls from './sections/Calls.jsx';
import Settings from './sections/Settings.jsx';
import Voices from './sections/Voices.jsx';

export default function App() {
  const [active, setActive] = useState('dashboard');

  const renderContent = () => {
    switch (active) {
      case 'dashboard':
        return <Dashboard />;
      case 'calls':
        return <Calls />;
      case 'settings':
        return <Settings />;
      case 'voices':
        return <Voices />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} onChange={setActive} />
      <main className="app-main">{renderContent()}</main>
    </div>
  );
}

