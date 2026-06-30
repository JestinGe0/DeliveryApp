// ========== AI CHAT — Gemma via Ollama ==========

let _aiMessages = [];      // { role: 'user'|'assistant', content: string }
let _aiOpen     = false;
let _aiStatus   = 'unknown'; // 'online' | 'offline' | 'unknown'
let _aiTyping   = false;

const AI_SUGGESTIONS = [
    'Summarise all routes and drivers',
    'Which orders are still pending?',
    'Write a delivery note for Van 1',
    'How is picking performance this week?'
];

// ── Panel open / close ────────────────────────────────────────────────────────

function openAIChat() {
    if (typeof FEATURES !== 'undefined' && FEATURES.aiChat === false) return;
    const panel = document.getElementById('ai-chat-panel');
    if (!panel) return;
    panel.classList.add('open');
    _aiOpen = true;

    if (_aiStatus === 'unknown') _checkAIStatus();
    if (_aiMessages.length === 0) _aiWelcome();

    setTimeout(() => {
        const input = document.getElementById('ai-chat-input');
        if (input) input.focus();
    }, 300);
}

function closeAIChat() {
    const panel = document.getElementById('ai-chat-panel');
    if (panel) panel.classList.remove('open');
    _aiOpen = false;
}

function toggleAIChat() {
    _aiOpen ? closeAIChat() : openAIChat();
}

// ── Status check ──────────────────────────────────────────────────────────────

async function _checkAIStatus() {
    try {
        const resp = await fetch('/api/ai/status');
        const data = await resp.json();
        _aiStatus = (data.available && data.gemma_ready) ? 'online'
                  : data.available                       ? 'no-model'
                  :                                        'offline';
    } catch {
        _aiStatus = 'offline';
    }
    _renderStatusBadge();
}

function _renderStatusBadge() {
    const dot   = document.getElementById('ai-status-dot');
    const label = document.getElementById('ai-status-label');
    if (!dot || !label) return;
    const map = {
        online:     { color: '#22c55e', text: 'Llama 3.2 · Ready' },
        'no-model': { color: '#f59e0b', text: 'Llama 3.2 · Model missing' },
        offline:    { color: '#ef4444', text: 'Llama 3.2 · Offline' },
        unknown:    { color: '#6b7280', text: 'Checking...' }
    };
    const s = map[_aiStatus] || map.unknown;
    dot.style.background = s.color;
    label.textContent    = s.text;
}

// ── Welcome message ───────────────────────────────────────────────────────────

function _aiWelcome() {
    _pushMessage('assistant',
        "Hi! I'm your dispatch assistant powered by Llama AI.\n\n" +
        "I can help with:\n" +
        "• Orders, routes, stops and driver assignments\n" +
        "• Picker names and picking performance\n" +
        "• Customer passport notes and delivery instructions\n" +
        "• Delivery note suggestions\n\n" +
        "What would you like to know?"
    );
}

// ── Send message ──────────────────────────────────────────────────────────────

function submitAIChatInput() {
    const input = document.getElementById('ai-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    _resizeInput();
    sendAIMessage(text);
}

function sendAIMessage(text) {
    if (!text || !text.trim() || _aiTyping) return;
    const trimmed = text.trim();

    _pushMessage('user', trimmed);
    _showTyping();

    // Only send last 12 messages (6 exchanges) to keep context lean
    const payload = _aiMessages.slice(-12).map(m => ({ role: m.role, content: m.content }));

    fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: payload,
            context:  _buildContext(),
            vanId:    typeof currentVan !== 'undefined' ? currentVan : null,
            dayId:    typeof currentDay !== 'undefined' ? currentDay : null
        })
    })
    .then(response => {
        _hideTyping();

        // Add empty bot message and a dedicated DOM bubble for streaming
        _aiMessages.push({ role: 'assistant', content: '' });
        const msgIdx = _aiMessages.length - 1;

        const container = document.getElementById('ai-chat-messages');
        const msgEl = document.createElement('div');
        msgEl.className = 'ai-msg ai-msg--bot';
        msgEl.innerHTML = '<div class="ai-msg-avatar"><i class="fas fa-robot"></i></div>' +
                          '<div class="ai-msg-bubble" id="ai-stream-bubble"></div>';
        if (container) container.appendChild(msgEl);
        const bubble = document.getElementById('ai-stream-bubble');

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = '';

        function pump() {
            return reader.read().then(({ done, value }) => {
                if (done) { _aiTyping = false; if (bubble) bubble.removeAttribute('id'); return; }

                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop(); // hold incomplete trailing line

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.t) {
                            _aiMessages[msgIdx].content += data.t;
                            if (bubble) {
                                bubble.innerHTML = _escHtml(_aiMessages[msgIdx].content)
                                    .replace(/\n/g, '<br>')
                                    .replace(/`([^`]+)`/g, '<code>$1</code>');
                                if (container) container.scrollTop = container.scrollHeight;
                            }
                        }
                        if (data.d) { _aiTyping = false; if (bubble) bubble.removeAttribute('id'); return; }
                    } catch { /* skip malformed line */ }
                }
                return pump();
            });
        }

        if (_aiStatus !== 'online') { _aiStatus = 'online'; _renderStatusBadge(); }
        return pump();
    })
    .catch(() => {
        _hideTyping();
        _pushMessage('assistant', 'Could not reach the AI service. Make sure `optimise.py` is running.');
        _aiStatus = 'offline';
        _renderStatusBadge();
    });
}

// ── Context builder ───────────────────────────────────────────────────────────

function _buildContext() {
    const lines = [];

    // Which van/day the dispatcher has open
    const van = typeof currentVan !== 'undefined' ? currentVan : null;
    const day = typeof currentDay !== 'undefined' ? currentDay : null;
    if (van && day) lines.push(`Dispatcher viewing: Van ${van}, Day ${day}`);

    // Current screen / page
    const screenEl = document.querySelector('.screen.active, [data-screen].active, .page.active');
    const screenId = screenEl ? (screenEl.id || screenEl.dataset.screen || '') : '';
    if (screenId) lines.push(`Screen: ${screenId}`);

    // Customer totals
    if (typeof customers !== 'undefined' && Array.isArray(customers)) {
        const total    = customers.length;
        const assigned = customers.filter(c => c.assignedVan && c.assignedDay).length;
        if (total)    lines.push(`Total customers in system: ${total}`);
        if (assigned) lines.push(`Customers with a route assigned: ${assigned}`);
    }

    return lines.length ? lines.join('\n') : null;
}

// ── Message list ──────────────────────────────────────────────────────────────

function _pushMessage(role, content) {
    _aiMessages.push({ role, content });
    _renderMessages();
}

function _renderMessages() {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;

    container.innerHTML = _aiMessages.map(msg => {
        const isUser = msg.role === 'user';
        const safe   = _escHtml(msg.content)
            .replace(/\n/g, '<br>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
        return `<div class="ai-msg ${isUser ? 'ai-msg--user' : 'ai-msg--bot'}">
            ${!isUser ? '<div class="ai-msg-avatar"><i class="fas fa-robot"></i></div>' : ''}
            <div class="ai-msg-bubble">${safe}</div>
        </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

function _showTyping() {
    _aiTyping = true;
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.id        = 'ai-typing-row';
    el.className = 'ai-msg ai-msg--bot';
    el.innerHTML = '<div class="ai-msg-avatar"><i class="fas fa-robot"></i></div>' +
                   '<div class="ai-msg-bubble ai-typing-dots"><span></span><span></span><span></span></div>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

function _hideTyping() {
    _aiTyping = false;
    const el = document.getElementById('ai-typing-row');
    if (el) el.remove();
}

// ── Input keyboard handling ───────────────────────────────────────────────────

function aiChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitAIChatInput();
    }
    _resizeInput();
}

function _resizeInput() {
    const ta = document.getElementById('ai-chat-input');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ── Clear chat ────────────────────────────────────────────────────────────────

function clearAIChat() {
    _aiMessages = [];
    _aiWelcome();
}

// ── Voice input — push-to-talk via local Whisper (fully offline) ─────────────
//
//  Hold mic button → MediaRecorder captures audio → release → audio sent to
//  Python /transcribe (faster-whisper) → text fills input → auto-send.
//  No Google, no internet required.

const WHISPER_URL   = 'http://localhost:8000/transcribe';
let _aiMediaRecorder = null;
let _aiAudioChunks   = [];
let _aiMicStream     = null;

async function startAIMic(e) {
    if (e) e.preventDefault();        // prevent touchstart also firing mousedown
    if (_aiMediaRecorder) return;      // already recording

    const btn   = document.getElementById('ai-mic-btn');
    const input = document.getElementById('ai-chat-input');

    try {
        _aiMicStream  = await navigator.mediaDevices.getUserMedia({ audio: true });
        _aiAudioChunks = [];
        _aiMediaRecorder = new MediaRecorder(_aiMicStream);

        _aiMediaRecorder.ondataavailable = ev => {
            if (ev.data && ev.data.size > 0) _aiAudioChunks.push(ev.data);
        };

        _aiMediaRecorder.onstart = () => {
            if (btn)   { btn.classList.add('recording'); btn.title = 'Release to send'; }
            if (input) { input.value = ''; input.placeholder = 'Listening…'; _resizeInput(); }
        };

        _aiMediaRecorder.onstop = async () => {
            // Release mic tracks immediately
            _aiMicStream?.getTracks().forEach(t => t.stop());
            _aiMicStream = null;

            if (btn)   { btn.classList.remove('recording'); btn.disabled = true; btn.title = 'Transcribing…'; }
            if (input) { input.placeholder = 'Transcribing…'; }

            try {
                const blob = new Blob(_aiAudioChunks, { type: 'audio/webm' });
                const form = new FormData();
                form.append('file', blob, 'audio.webm');

                const resp = await fetch(WHISPER_URL, { method: 'POST', body: form });
                const data = await resp.json();

                if (data.text) {
                    if (input) { input.value = data.text; _resizeInput(); }
                    submitAIChatInput();
                } else {
                    const msg = data.error || 'Could not understand audio';
                    if (input) input.placeholder = msg;
                    console.warn('[AI Mic]', msg);
                    setTimeout(() => { if (input) input.placeholder = 'Ask about routes, orders, drivers…'; }, 4000);
                }
            } catch (err) {
                console.error('[AI Mic] Transcription fetch failed:', err);
                if (input) input.placeholder = 'Transcription failed — is optimise.py running?';
                setTimeout(() => { if (input) input.placeholder = 'Ask about routes, orders, drivers…'; }, 4000);
            } finally {
                if (btn) { btn.disabled = false; btn.title = 'Hold to speak'; }
            }

            _aiMediaRecorder = null;
            _aiAudioChunks   = [];
        };

        _aiMediaRecorder.start();

    } catch (err) {
        _aiMediaRecorder = null;
        _aiMicStream?.getTracks().forEach(t => t.stop());
        _aiMicStream = null;
        if (btn) { btn.classList.remove('recording'); btn.disabled = false; btn.title = 'Hold to speak'; }
        if (err.name === 'NotAllowedError') {
            alert('Microphone access was denied. Please allow it in your browser settings.');
        } else {
            console.error('[AI Mic]', err);
        }
    }
}

function stopAIMic() {
    if (_aiMediaRecorder && _aiMediaRecorder.state === 'recording') {
        _aiMediaRecorder.stop();   // triggers onstop → transcription → send
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
