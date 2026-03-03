import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import twilio from 'twilio';
import axios from 'axios';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { pool, initDatabase } from './db.js';

const {
  PORT = 3000,
  PUBLIC_BASE_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  ELEVENLABS_API_KEY,
  ELEVENLABS_MODEL_ID,
  GROQ_API_KEY
} = process.env;

const ELEVENLABS_TTS_MODEL = ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VOICES_DIR = path.join(__dirname, 'voices');
const VOICES_DB_PATH = path.join(__dirname, 'voices.json');
const SCRIPT_PATH = path.join(__dirname, 'Data', 'script', '5_Steps_Marketing_Updated.md');

function ensureVoicesStorage() {
  if (!fs.existsSync(VOICES_DIR)) {
    fs.mkdirSync(VOICES_DIR, { recursive: true });
  }
  if (!fs.existsSync(VOICES_DB_PATH)) {
    fs.writeFileSync(VOICES_DB_PATH, '[]', 'utf8');
  }
}

function loadVoices() {
  try {
    const raw = fs.readFileSync(VOICES_DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveVoices(voices) {
  fs.writeFileSync(VOICES_DB_PATH, JSON.stringify(voices, null, 2), 'utf8');
}

ensureVoicesStorage();

let SCRIPT_TEXT = '';
try {
  if (fs.existsSync(SCRIPT_PATH)) {
    SCRIPT_TEXT = fs.readFileSync(SCRIPT_PATH, 'utf8');
  }
} catch (e) {
  console.warn('Failed to load script file:', e?.message || e);
}

// --- Structured 5-step / 16-sub-step script segments for Version A (simplified port) ---
const SCRIPT_SEGMENTS = [
  // STEP 1 -- INTRODUCTION
  {
    step: 1,
    subStep: 1,
    label: 'Gatekeeper',
    lines: [
      'Hi, can I speak to the owner please?',
      "It is nothing serious, it is just a quick introductory call."
    ]
  },
  {
    step: 1,
    subStep: 2,
    label: 'Relax the prospect',
    lines: ["Hi. It is nothing serious."]
  },
  {
    step: 1,
    subStep: 3,
    label: 'Reason for contact',
    lines: [
      'It is just a quick introductory call. I wanted to give you the chance to see some information on how to reduce costs in your business.',
      "My name is Jay from Proactiv. Sorry, who am I speaking with?"
    ]
  },
  {
    step: 1,
    subStep: 4,
    label: 'Create interest',
    lines: [
      'Proactiv have been established since 2009. We have developed several unique concepts that help businesses reduce overheads, increase word of mouth referrals, and eliminate advertising costs.',
      "It is genuinely a game changer."
    ]
  },
  {
    step: 1,
    subStep: 5,
    label: 'Pre-close checkpoint',
    lines: ["That sounds pretty interesting, I am sure you would agree?"]
  },
  // STEP 2 -- PRESENTATION
  {
    step: 2,
    subStep: 1,
    label: 'Qualify',
    lines: ['Could you handle more customers in your business?']
  },
  {
    step: 2,
    subStep: 2,
    label: 'Highlight problem',
    lines: ['Government statistics state that over twenty five percent of MOTs are carried out late in the UK.']
  },
  {
    step: 2,
    subStep: 3,
    label: 'Fact find',
    lines: [
      'Do you currently have anything in place to help customers remember their MOT due date?',
      'I am sure you would agree word of mouth is the best way to attract new customers.'
    ]
  },
  // STEP 3 -- EXPLANATION
  {
    step: 3,
    subStep: 1,
    label: 'Story 1 - why cards are kept',
    lines: [
      'Plastic cards look and feel like credit cards. They are durable, perceived as valuable, and kept in wallets.'
    ]
  },
  {
    step: 3,
    subStep: 2,
    label: 'Story 1 pre-close',
    lines: ['They sound like a good idea, I am sure you would agree?']
  },
  {
    step: 3,
    subStep: 3,
    label: 'Story 2 - referral tracking',
    lines: ['Cards get passed on. You can monitor referrals and reward customers.']
  },
  {
    step: 3,
    subStep: 4,
    label: 'Story 2 pre-close',
    lines: ["It sounds like a strong concept, does it not?"]
  },
  {
    step: 3,
    subStep: 5,
    label: 'Story 3 - key fob comparison',
    lines: [
      'Solid plastic fobs last five to six years versus laminated versions that peel. Makes sense why solid lasts longer, right?'
    ]
  },
  {
    step: 3,
    subStep: 6,
    label: 'Story 4 - writable MOT reminder',
    lines: ['Writable coating allows MOT due date reminders on customer keys.']
  },
  // STEP 4 -- CLOSE
  {
    step: 4,
    subStep: 1,
    label: 'Master pre-close',
    lines: [
      'Overall, it sounds like a pretty solid idea for a garage like yours, would you say so?'
    ]
  },
  {
    step: 4,
    subStep: 2,
    label: 'Explain how we work',
    lines: [
      'We show business owners samples over camera, ten to fifteen minutes, no travel required.'
    ]
  },
  {
    step: 4,
    subStep: 3,
    label: 'Assumptive close',
    lines: ["I have availability later today or tomorrow. Which works better for you?"]
  },
  // STEP 5 -- CONSOLIDATION
  {
    step: 5,
    subStep: 1,
    label: 'Confirm decision makers',
    lines: ['Is anyone else involved in making this decision?']
  },
  {
    step: 5,
    subStep: 2,
    label: 'Confirm contact details',
    lines: [
      'Let me confirm your full name, business name, mobile and email so we can send confirmation.'
    ]
  },
  {
    step: 5,
    subStep: 3,
    label: 'Prepare for next stage',
    lines: [
      'You will receive an email and a reminder before the appointment, with a link for the video call.'
    ]
  },
  {
    step: 5,
    subStep: 4,
    label: 'Farewell',
    lines: [
      'It has been great speaking with you. We look forward to speaking at the appointment. Enjoy the rest of your day.'
    ]
  }
];

function must(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
}

must('PUBLIC_BASE_URL', PUBLIC_BASE_URL);
must('TWILIO_ACCOUNT_SID', TWILIO_ACCOUNT_SID);
must('TWILIO_AUTH_TOKEN', TWILIO_AUTH_TOKEN);
must('TWILIO_FROM_NUMBER', TWILIO_FROM_NUMBER);
must('ELEVENLABS_API_KEY', ELEVENLABS_API_KEY);
must('GROQ_API_KEY', GROQ_API_KEY);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*'
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/media/voices', express.static(VOICES_DIR));

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Very light E.164-ish check
function isE164(number) {
  return typeof number === 'string' && /^\+\d{8,15}$/.test(number.trim());
}

async function generateInteractiveReply(userText) {
  const prompt = `
You are a UK female AI telemarketer working for Proactiv, using a friendly and professional tone.
You are calling small business owners to introduce the 5 Steps Marketing methodology that helps:
- reduce overheads
- increase word-of-mouth referrals
- eliminate advertising costs

The conversation must be SHORT, clear and spoken-friendly (no bullet points, no headings).
Reply with ONE or TWO short sentences that move the call forward.
Avoid repeating the same introduction each time.

Customer just said: "${userText || '(no clear speech captured)'}"
`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a concise, friendly UK female telemarketer voice.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 120
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  return (content || '').trim() || 'Thanks for your time today. Have a great day, goodbye.';
}

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  socket.emit('server-ready', { ok: true });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

// --- API: start an outbound call ---
app.post('/api/call', async (req, res) => {
  try {
    const { to, message, version, voiceName } = req.body;

    if (!isE164(to)) {
      return res.status(400).json({ error: 'Invalid "to" number. Use E.164 format like +14155552671' });
    }
    if (version !== 'A' && (typeof message !== 'string' || message.trim().length === 0)) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const base = PUBLIC_BASE_URL.replace(/\/$/, '');

    let twimlUrl;

    if (version === 'B') {
      twimlUrl = `${base}/twiml/interactive`;
    } else if (version === 'A') {
      // Version A: scripted multi-step conversation using Twilio TTS (no mp3 generation)
      twimlUrl = `${base}/twiml/scripted?idx=0`;
    } else {
      // Default: simple Twilio TTS
      twimlUrl = `${base}/twiml?msg=${encodeURIComponent(message.trim().slice(0, 800))}`;
    }
    const statusCallbackUrl = `${base}/twilio/status`;

    const call = await client.calls.create({
      to: to.trim(),
      from: TWILIO_FROM_NUMBER.trim(),
      url: twimlUrl,
      method: 'GET',
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    // Persist call row
    try {
      await pool.query(
        'insert into calls (call_sid, version, to_number, voice_name, status, meta) values ($1, $2, $3, $4, $5, $6)',
        [call.sid, version || null, to.trim(), voiceName || null, call.status || null, null]
      );
    } catch (dbErr) {
      console.warn('Failed to persist call to database:', dbErr?.message || dbErr);
    }

    // Immediately notify UI
    io.emit('call-status', {
      callSid: call.sid,
      callStatus: call.status,
      to: call.to,
      from: call.from
    });

    return res.json({ ok: true, callSid: call.sid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// --- API: ElevenLabs voice management ---
// List voices (VoiceInfo[])
app.get('/api/voices', (req, res) => {
  const voices = loadVoices();
  res.json(voices);
});

// Clone a new voice from an audio sample
// Expects multipart/form-data with:
// - file: audio file
// - voice_name: string
// - language: string (e.g. "en")
app.post('/api/voices/clone', upload.single('file'), async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key is not configured on the server' });
    }

    const file = req.file;
    const { voice_name, language } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Source voice file is required' });
    }

    const voiceNameRaw = typeof voice_name === 'string' ? voice_name.trim() : '';
    if (!voiceNameRaw) {
      return res.status(400).json({ error: 'voice_name is required' });
    }

    const lang = typeof language === 'string' && language.trim() ? language.trim() : 'en';

    const voices = loadVoices();
    if (voices.find((v) => v.name === voiceNameRaw)) {
      return res.status(409).json({ error: `Voice '${voiceNameRaw}' already exists` });
    }

    // Create a cloned voice in ElevenLabs
    const formData = new FormData();
    formData.append('name', voiceNameRaw);
    formData.append('files', file.buffer, {
      filename: file.originalname || 'sample.wav',
      contentType: file.mimetype || 'audio/mpeg'
    });

    const createResp = await axios.post('https://api.elevenlabs.io/v1/voices/add', formData, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        ...formData.getHeaders()
      },
      maxBodyLength: Infinity
    });

    const { voice_id: elevenlabsVoiceId } = createResp.data || {};
    if (!elevenlabsVoiceId) {
      return res.status(500).json({ error: 'Failed to create cloned voice with ElevenLabs' });
    }

    const now = new Date().toISOString();
    const voiceRecord = {
      name: voiceNameRaw,
      language: lang,
      created_at: now,
      elevenlabs_voice_id: elevenlabsVoiceId,
      description: `Cloned via ElevenLabs at ${now}`,
      source_audio: undefined
    };

    voices.push(voiceRecord);
    saveVoices(voices);

    return res.json({
      message: `Voice '${voiceNameRaw}' cloned successfully`,
      voice_name: voiceNameRaw,
      language: lang
    });
  } catch (err) {
    console.error('Error cloning voice with ElevenLabs:', err?.response?.data || err);
    return res.status(500).json({ error: 'Failed to clone voice. Check server logs for details.' });
  }
});

// Get details for a single voice
app.get('/api/voices/:voiceName', (req, res) => {
  const { voiceName } = req.params;
  const decodedName = decodeURIComponent(voiceName);
  const voices = loadVoices();
  const record = voices.find((v) => v.name === decodedName);

  if (!record) {
    return res.status(404).json({ error: `Voice '${decodedName}' not found` });
  }

  return res.json(record);
});

// Delete a cloned voice
app.delete('/api/voices/:voiceName', async (req, res) => {
  const { voiceName } = req.params;
  const decodedName = decodeURIComponent(voiceName);
  const voices = loadVoices();
  const index = voices.findIndex((v) => v.name === decodedName);

  if (index === -1) {
    return res.status(404).json({ error: `Voice '${decodedName}' not found` });
  }

  const [removed] = voices.splice(index, 1);
  saveVoices(voices);

  // Best-effort cleanup on ElevenLabs side (optional)
  if (removed && removed.elevenlabs_voice_id) {
    try {
      await axios.delete(`https://api.elevenlabs.io/v1/voices/${removed.elevenlabs_voice_id}`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      });
    } catch (e) {
      console.warn('Failed to delete voice from ElevenLabs:', e?.response?.data || e.message || e);
    }
  }

  return res.json({ message: `Voice '${decodedName}' deleted` });
});

// Synthesize speech using an existing cloned voice
// Body: { voice_name, text, language }
app.post('/api/voices/synthesize', async (req, res) => {
  try {
    const { voice_name, text, language } = req.body || {};

    const voiceNameRaw = typeof voice_name === 'string' ? voice_name.trim() : '';
    if (!voiceNameRaw) {
      return res.status(400).json({ error: 'voice_name is required' });
    }

    const txt = typeof text === 'string' ? text.trim() : '';
    if (!txt) {
      return res.status(400).json({ error: 'text is required' });
    }

    const voices = loadVoices();
    const record = voices.find((v) => v.name === voiceNameRaw);
    if (!record || !record.elevenlabs_voice_id) {
      return res.status(404).json({ error: `Voice '${voiceNameRaw}' not found or not linked to ElevenLabs` });
    }

    const lang = typeof language === 'string' && language.trim() ? language.trim() : record.language || 'en';

    const ttsResp = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${record.elevenlabs_voice_id}`,
      {
        text: txt,
        model_id: ELEVENLABS_TTS_MODEL,
        // ElevenLabs multilingual model infers language from text; we still pass through
        // the voice settings for stability/similarity.
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(Buffer.from(ttsResp.data));
  } catch (err) {
    console.error('Error synthesizing voice with ElevenLabs:', err?.response?.data || err);
    return res.status(500).json({ error: 'Failed to synthesize voice. Check server logs for details.' });
  }
});

// Fallback JSON error handler (including Multer errors)
// This prevents HTML error pages that break frontend JSON parsing.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message || 'Upload error' });
  }

  return res.status(500).json({ error: err.message || 'Internal server error' });
});

// --- TwiML endpoint: what Twilio executes when call connects ---
app.get('/twiml', (req, res) => {
  const msg = (req.query.msg || '').toString();

  const twiml = new twilio.twiml.VoiceResponse();

  // You can swap Say for Play (audio URL) if you want a recorded file.
  twiml.say(
    {
      voice: 'alice',
      language: 'en-US'
    },
    msg.length ? msg : 'Hello. This is a voice message.'
  );

  // Optional pause and goodbye
  twiml.pause({ length: 1 });
  twiml.say({ voice: 'alice', language: 'en-US' }, 'Goodbye.');

  res.type('text/xml');
  res.send(twiml.toString());
});

// --- TwiML endpoint: scripted Version A entrypoint (step-by-step with Twilio TTS) ---
app.get('/twiml/scripted', (req, res) => {
  const idx = Number((req.query.idx || '0').toString());
  const segment = SCRIPT_SEGMENTS[idx];

  const twiml = new twilio.twiml.VoiceResponse();

  if (!segment) {
    twiml.say(
      { voice: 'alice', language: 'en-GB' },
      'Thank you for your time today. Goodbye.'
    );
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  const gather = twiml.gather({
    input: 'speech',
    action: `/twilio/scripted?idx=${idx}`,
    method: 'POST',
    language: 'en-GB',
    timeout: 5
  });

  gather.say(
    { voice: 'alice', language: 'en-GB' },
    segment.lines.join(' ')
  );

  res.type('text/xml');
  res.send(twiml.toString());
});

// --- TwiML endpoint: interactive Version B entrypoint ---
app.get('/twiml/interactive', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    action: '/twilio/interactive',
    method: 'POST',
    language: 'en-GB',
    timeout: 5
  });

  gather.say(
    {
      voice: 'alice',
      language: 'en-GB'
    },
    "Hello, it's your AI telemarketer calling from Proactiv. I'd like to quickly explain how we can help reduce your overheads and increase referrals. To start, could you tell me if you're currently taking on new customers?"
  );

  // Fallback if no speech is captured
  twiml.say(
    { voice: 'alice', language: 'en-GB' },
    'If now is not a good time, we can always call back later. Goodbye for now.'
  );

  res.type('text/xml');
  res.send(twiml.toString());
});

// --- Interactive handler: uses Groq LLM for Version B replies ---
app.post('/twilio/interactive', async (req, res, next) => {
  try {
    const speechResult = (req.body.SpeechResult || '').toString();

    const reply = await generateInteractiveReply(speechResult);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      {
        voice: 'alice',
        language: 'en-GB'
      },
      reply
    );
    twiml.pause({ length: 1 });
    twiml.say({ voice: 'alice', language: 'en-GB' }, 'Thank you for your time. Goodbye.');

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    return next(err);
  }
});

// --- Scripted handler: Version A multi-step flow with logging ---
app.post('/twilio/scripted', async (req, res, next) => {
  try {
    const idx = Number((req.query.idx || '0').toString());
    const speechResult = (req.body.SpeechResult || '').toString();
    const callSid = (req.body.CallSid || '').toString();
    const from = (req.body.From || '').toString();
    const to = (req.body.To || '').toString();

    console.log('[SCRIPTED] CallSid=%s idx=%d speech="%s"', callSid, idx, speechResult);
    io.emit('call-log', {
      callSid,
      direction: 'inbound',
      from,
      to,
      stepIndex: idx,
      transcript: speechResult
    });

    const nextIdx = idx + 1;
    const nextSegment = SCRIPT_SEGMENTS[nextIdx];

    const twiml = new twilio.twiml.VoiceResponse();

    if (!nextSegment) {
      twiml.say(
        { voice: 'alice', language: 'en-GB' },
        'Thank you for your time today. Goodbye.'
      );
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    const gather = twiml.gather({
      input: 'speech',
      action: `/twilio/scripted?idx=${nextIdx}`,
      method: 'POST',
      language: 'en-GB',
      timeout: 5
    });

    gather.say(
      { voice: 'alice', language: 'en-GB' },
      nextSegment.lines.join(' ')
    );

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    return next(err);
  }
});

// --- Twilio status callback webhook: emits updates to browser via Socket.IO ---
app.post('/twilio/status', (req, res) => {
  const {
    CallSid,
    CallStatus,
    To,
    From,
    Timestamp,
    ApiVersion
  } = req.body;

  io.emit('call-status', {
    callSid: CallSid,
    callStatus: CallStatus,
    to: To,
    from: From,
    timestamp: Timestamp,
    apiVersion: ApiVersion
  });

  // Best-effort DB update
  if (CallSid) {
    pool
      .query('update calls set status = $1 where call_sid = $2', [CallStatus || null, CallSid])
      .catch((err) => {
        console.warn('Failed to update call status in database:', err?.message || err);
      });
  }

  res.status(200).send('OK');
});

initDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Backend listening on http://localhost:${PORT}`);
      console.log(`PUBLIC_BASE_URL = ${PUBLIC_BASE_URL}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

