import React, { useEffect, useState } from 'react';

const MAX_TEST_TEXT_LENGTH = 300;

function formatCreatedAt(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString();
}

export default function Voices() {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Clone voice form state
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [language, setLanguage] = useState('en');
  const [uploading, setUploading] = useState(false);

  // Test synthesized audio state
  const [selectedVoice, setSelectedVoice] = useState('');
  const [testText, setTestText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [downloadFileName, setDownloadFileName] = useState('cloned_voice_sample.mp3');

  const loadVoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/voices');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load voices');
      }
      setVoices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load voices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVoices();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|mpeg)$/i)) {
      setError('Please select a valid audio file (WAV or MP3)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Audio file must be less than 10MB');
      return;
    }

    setAudioFile(file);
    setError(null);
  };

  const handleCloneVoice = async (e) => {
    e.preventDefault();

    if (!audioFile) {
      setError('Please select an audio file');
      return;
    }
    if (!voiceName.trim()) {
      setError('Please enter a voice name');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', audioFile, audioFile.name || 'audio.wav');
      formData.append('voice_name', voiceName.trim());
      formData.append('language', language);

      const res = await fetch('/api/voices/clone', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to clone voice');
      }

      setSuccess(`Voice '${voiceName}' cloned successfully!`);
      setVoiceName('');
      setAudioFile(null);
      setShowCloneForm(false);
      await loadVoices();
    } catch (err) {
      setError(err.message || 'Failed to clone voice');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVoice = async (voiceNameToDelete) => {
    if (!window.confirm(`Are you sure you want to delete voice '${voiceNameToDelete}'?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/voices/${encodeURIComponent(voiceNameToDelete)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete voice');
      }
      setSuccess(`Voice '${voiceNameToDelete}' deleted successfully`);
      await loadVoices();
    } catch (err) {
      setError(err.message || 'Failed to delete voice');
    }
  };

  const handleGenerateSample = async (e) => {
    e.preventDefault();

    if (!selectedVoice) {
      setError('Please select a cloned voice to test.');
      return;
    }
    if (!testText.trim()) {
      setError('Please enter text to synthesize.');
      return;
    }
    if (testText.trim().length > MAX_TEST_TEXT_LENGTH) {
      setError(`Text is too long. Maximum is ${MAX_TEST_TEXT_LENGTH} characters.`);
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const voice = voices.find((v) => v.name === selectedVoice);
      const lang = voice?.language || language || 'en';

      const res = await fetch('/api/voices/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_name: selectedVoice,
          text: testText.trim(),
          language: lang
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate voice sample');
      }

      const blob = await res.blob();

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setDownloadFileName(`${selectedVoice}_sample.mp3`);
      setSuccess(`Generated audio sample for '${selectedVoice}'.`);
    } catch (err) {
      setError(err.message || 'Failed to generate voice sample');
    } finally {
      setGenerating(false);
    }
  };

  const handleClearSample = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  return (
    <section>
      <h1 className="section-title">Voices</h1>
      <p className="section-subtitle">
        Clone voices from audio samples using ElevenLabs and test them with custom scripts.
      </p>

      {error && <p className="error-text">Error: {error}</p>}
      {success && <p className="error-text" style={{ color: '#bbf7d0' }}>{success}</p>}

      <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
        <button type="button" onClick={() => setShowCloneForm((v) => !v)} style={{ marginBottom: '1rem' }}>
          {showCloneForm ? 'Cancel' : '+ Clone New Voice'}
        </button>
      </div>

      {showCloneForm && (
        <div className="form" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-subheading">Clone Voice from Audio Sample</h2>
          <form onSubmit={handleCloneVoice}>
            <label className="field py-2">
              <span>Voice Name</span>
              <input
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="e.g., company_voice"
                required
              />
            </label>

            <label className="field py-2">
              <span>Audio File</span>
              <input
                type="file"
                accept="audio/wav,audio/mpeg,audio/mp3"
                onChange={handleFileChange}
                required
              />
              <small>Upload 3–10 seconds of clear speech (WAV or MP3, max 10MB)</small>
            </label>

            <label className="field pt-2 pb-4">
              <span>Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="pl">Polish</option>
                <option value="tr">Turkish</option>
                <option value="ru">Russian</option>
                <option value="nl">Dutch</option>
                <option value="cs">Czech</option>
                <option value="ar">Arabic</option>
                <option value="zh-cn">Chinese (Simplified)</option>
                <option value="ja">Japanese</option>
                <option value="hu">Hungarian</option>
                <option value="ko">Korean</option>
              </select>
            </label>

            <button type="submit" disabled={uploading || !audioFile || !voiceName.trim()}>
              {uploading ? 'Cloning…' : 'Clone Voice'}
            </button>
          </form>
        </div>
      )}

      <h2 className="section-subheading">Available Voices ({voices.length})</h2>
      {loading ? (
        <p>Loading voices…</p>
      ) : voices.length === 0 ? (
        <p>No cloned voices available. Clone a voice to get started.</p>
      ) : (
        <div className="voice-list">
          {voices.map((voice) => (
            <div key={voice.name} className="voice-card">
              <div className="voice-card-main">
                <h3 className="voice-name">{voice.name}</h3>
                <p className="voice-meta">
                  Language: {voice.language} | Created: {formatCreatedAt(voice.created_at)}
                </p>
                {voice.description && (
                  <p className="voice-script">
                    <span className="label">Description:</span> {voice.description}
                  </p>
                )}
              </div>
              <div className="voice-card-actions">
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleDeleteVoice(voice.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="form" style={{ marginTop: '2rem' }}>
        <h2 className="section-subheading">Test Cloned Voice</h2>
        <p>Select a cloned voice, enter some text, and generate a sample you can play or download.</p>

        {voices.length === 0 ? (
          <p>No cloned voices available yet. Clone a voice above to begin testing.</p>
        ) : (
          <form onSubmit={handleGenerateSample}>
            <label className="field">
              <span>Select Voice</span>
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

            <label className="field py-4">
              <span>Text to Synthesize</span>
              <textarea
                value={testText}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= MAX_TEST_TEXT_LENGTH) {
                    setTestText(value);
                  }
                }}
                maxLength={MAX_TEST_TEXT_LENGTH}
                placeholder="Type the text you want to hear in the selected cloned voice..."
                rows={4}
              />
              <small>
                {testText.length}/{MAX_TEST_TEXT_LENGTH} characters
              </small>
            </label>

            <button type="submit" disabled={generating || !selectedVoice || !testText.trim()}>
              {generating ? 'Generating…' : 'Generate Sample'}
            </button>
          </form>
        )}

        {audioUrl && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3 className="section-subheading">Preview & Download</h3>
            <audio controls src={audioUrl} style={{ width: '100%' }}>
              Your browser does not support the audio element.
            </audio>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem' }}>
              <a href={audioUrl} download={downloadFileName}>
                Download generated audio
              </a>
              <button type="button" onClick={handleClearSample}>
                Delete generated audio
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

