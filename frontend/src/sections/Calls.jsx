import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const VERSION_B_INTRO =
  "Hello, this is your AI telemarketer. I'd like to speak with you about improving your marketing results. I'll keep this brief.";

export default function Calls() {
  const [to, setTo] = useState('');
  const [version, setVersion] = useState('A');
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [sending, setSending] = useState(false);
  const [logLines, setLogLines] = useState([]);

  useEffect(() => {
    const socket = io();

    const addLog = (line) => {
      setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] ${line}`, ...prev]);
    };

    socket.on('connect', () => addLog(`Socket connected: ${socket.id}`));
    socket.on('server-ready', () => addLog('Server ready'));
    socket.on('call-status', (payload) => {
      const { callSid, callStatus, to: callTo, from } = payload;
      addLog(`Call ${callSid || ''} status=${callStatus} to=${callTo || ''} from=${from || ''}`);
    });

    socket.on('call-log', (payload) => {
      const { callSid, transcript, stepIndex } = payload;
      addLog(
        `SCRIPTED_LOG callSid=${callSid || ''} step=${typeof stepIndex === 'number' ? stepIndex : ''
        } text="${transcript || ''}"`
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const loadVoices = async () => {
      try {
        const res = await fetch('/api/voices');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load voices');
        }
        setVoices(Array.isArray(data) ? data : []);
      } catch (err) {
        setLogLines((prev) => [
          `[${new Date().toLocaleTimeString()}] ERROR loading voices: ${err.message}`,
          ...prev
        ]);
      }
    };
    loadVoices();
  }, []);

  const handleStartCall = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      if (version === 'A' && !selectedVoice) {
        throw new Error('Please select a cloned voice for Version A.');
      }

      const message = VERSION_B_INTRO;

      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          message,
          version,
          voiceName: version === 'A' ? selectedVoice : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }
      setLogLines((prev) => [
        `[${new Date().toLocaleTimeString()}] Call created (Version ${version}). CallSid=${data.callSid}`,
        ...prev
      ]);
    } catch (err) {
      setLogLines((prev) => [
        `[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`,
        ...prev
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h1 className="section-title">Calls</h1>
      <p className="section-subtitle">
        Start outbound AI telemarketer calls and watch real-time status updates.
      </p>

      <form className="form" onSubmit={handleStartCall}>
        <label className="field">
          <span>To number (E.164)</span>
          <input
            type="tel"
            placeholder="+14155552671"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Telemarketer Version</span>
          <div className="flex gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="version"
                value="A"
                checked={version === 'A'}
                onChange={() => setVersion('A')}
              />
              <span>Version A – Scripted AI Voice Clone</span>
            </label>
          </div>
          <div className="flex gap-3 text-sm mt-1">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="version"
                value="B"
                checked={version === 'B'}
                onChange={() => setVersion('B')}
              />
              <span>Version B – Interactive AI Telemarketer</span>
            </label>
          </div>
        </label>

        {version === 'A' && (
          <label className="field">
            <span>Cloned Voice (Version A)</span>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
            >
              <option value="">-- Choose a cloned voice --</option>
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.language})
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="submit" disabled={sending}>
          {sending ? 'Starting call…' : 'Start Call'}
        </button>
      </form>

      <h2 className="section-subheading">Status</h2>
      <pre className="log-area">{logLines.join('\n')}</pre>
    </section>
  );
}

