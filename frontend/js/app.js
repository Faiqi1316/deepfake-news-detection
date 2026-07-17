const API_BASE = ""; // relative to same origin
const AUTH_KEY = "jwt";

function getToken() { return localStorage.getItem(AUTH_KEY) || ""; }
function setToken(t) { if (t) localStorage.setItem(AUTH_KEY, t); }
function clearToken() { localStorage.removeItem(AUTH_KEY); }
// ── Richer verdict helpers ──────────────────────────────────────────────────
/**
 * Returns { display, badgeClass, barClass, icon, description } for a prediction result.
 * Prefers verdictCategory over the raw binary label.
 */
function verdictInfo(data) {
    const vc = (data.verdictCategory || '').trim();
    const label = (data.label || 'Unknown').trim();
    const display = vc || label;
    const d = display.toLowerCase();
    if (d.includes('likely fake')) return { display, badgeClass: 'danger',  barClass: 'danger',  icon: '⚠️',  desc: 'High likelihood of false or fabricated content.' };
    if (d.includes('likely real')) return { display, badgeClass: 'success', barClass: 'success', icon: '✅',  desc: 'AI assessment suggests this content is genuine.' };
    if (d.includes('misleading'))  return { display, badgeClass: 'warn',    barClass: 'warn',    icon: '🟡',  desc: 'Content may be distorted, out of context, or exaggerated.' };
    if (d.includes('satire'))      return { display, badgeClass: 'info',    barClass: 'info',    icon: '😄',  desc: 'Content appears to be satirical or opinion-based.' };
    if (d.includes('inconclusive'))return { display, badgeClass: 'neutral', barClass: 'neutral', icon: '❓',  desc: 'Insufficient evidence to reach a confident verdict.' };
    if (d.includes('fake'))        return { display, badgeClass: 'danger',  barClass: 'danger',  icon: '🚨', desc: 'Classified as fake or fabricated.' };
    if (d.includes('real'))        return { display, badgeClass: 'success', barClass: 'success', icon: '✅',  desc: 'Classified as real and credible.' };
    return { display: display || 'Unknown', badgeClass: 'neutral', barClass: 'neutral', icon: '❓', desc: 'No verdict classification available.' };
}

function _buildSourcePanel(data, kind) {
    const src = data.source || 'unknown';
    const pct = Math.round(Number(data.confidence) * 100);
    const isFallback = src === 'heuristic' || src.includes('fallback');
    const sample = Number(data.calibrationSampleSize || 0);
    const shift = Number(data.calibrationShift || 0);
    const calibrationBadge = Math.abs(shift) > 0.0001
        ? `<span class="badge ${shift > 0 ? 'success' : 'warn'}" style="font-size:11px;padding:2px 8px">${shift > 0 ? '+' : ''}${Math.round(shift * 100)} pts</span>`
        : '<span class="badge neutral" style="font-size:11px;padding:2px 8px">No shift</span>';
    const modelLabels = {
        'local-logreg':  'DeBERTa v3 + Logistic Regression (local)',
        'zero-shot':     'Zero-shot BART classifier (HuggingFace)',
        'heuristic':     'Keyword heuristic (fallback)',
        'DistilBERT':    'DistilBERT (local)',
        'HF-API':        'HuggingFace Inference API'
    };
    const modelLabel = modelLabels[src] || src;
    const confTier = pct >= 80 ? { label: 'High', cls: 'success' } : pct >= 60 ? { label: 'Medium', cls: 'warn' } : { label: 'Low', cls: 'danger' };
    const inputLabel = kind === 'url' ? '🔗 URL' : '📝 Text';
    return `<details class="source-panel">
      <summary>🔍 How was this determined?</summary>
      <div class="source-panel-grid">
        <div class="source-item"><span class="source-label">Model</span><span class="source-value">${modelLabel}</span></div>
        <div class="source-item"><span class="source-label">Input Type</span><span class="source-value">${inputLabel}</span></div>
        <div class="source-item"><span class="source-label">Confidence Tier</span><span class="source-value"><span class="badge ${confTier.cls}" style="font-size:11px;padding:2px 8px">${confTier.label} (${pct}%)</span></span></div>
        <div class="source-item"><span class="source-label">Fallback Used</span><span class="source-value">${isFallback ? '<span class="badge warn" style="font-size:11px;padding:2px 8px">Yes</span>' : '<span class="badge success" style="font-size:11px;padding:2px 8px">No</span>'}</span></div>
                <div class="source-item"><span class="source-label">Feedback Calibration</span><span class="source-value">${calibrationBadge}</span></div>
                <div class="source-item"><span class="source-label">Calibration Sample</span><span class="source-value">${sample > 0 ? sample + ' feedbacks' : 'Insufficient data'}</span></div>
      </div>
    </details>`;
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** ASP.NET often serializes PascalCase; Python uses camelCase — normalize for the UI. */
function normalizeApiPrediction(data) {
    if (!data || typeof data !== 'object') return data;
    const d = { ...data };
    if (d.label == null && d.Label != null) d.label = d.Label;
    if (d.confidence == null && d.Confidence != null) d.confidence = d.Confidence;
    if (d.verdictCategory == null && d.VerdictCategory != null) d.verdictCategory = d.VerdictCategory;
    if (d.source == null && d.Source != null) d.source = d.Source;
    if (d.predictionId == null && d.PredictionId != null) d.predictionId = d.PredictionId;
    if (d.calibrationSampleSize == null && d.CalibrationSampleSize != null) d.calibrationSampleSize = d.CalibrationSampleSize;
    if (d.calibrationShift == null && d.CalibrationShift != null) d.calibrationShift = d.CalibrationShift;
    if (d.webVerification == null && d.WebVerification != null) d.webVerification = d.WebVerification;
    if (d.overriddenByWeb == null && d.OverriddenByWeb != null) d.overriddenByWeb = d.OverriddenByWeb;
    return d;
}

function _buildWebVerificationPanel(data) {
    const wv = data.webVerification;
    if (!wv || !wv.verdict) return '';
    const v = String(wv.verdict);
    const pct = Math.round(Number(wv.confidence || 0) * 100);
    let icon, cls, headline;
    if (v === 'Supported')      { icon = '🌐✅'; cls = 'success'; headline = `Confirmed by live web sources (${pct}%)`; }
    else if (v === 'Refuted')   { icon = '🌐❌'; cls = 'danger';  headline = `Contradicted by live web sources (${pct}%)`; }
    else if (v === 'NoEvidence'){ icon = '🌐';   cls = 'neutral'; headline = 'No live web coverage found for this claim'; }
    else                        { icon = '🌐❓'; cls = 'neutral'; headline = 'Web evidence inconclusive'; }
    const sources = Array.isArray(wv.sources) ? wv.sources : [];
    const rows = sources.slice(0, 6).map(s => {
        const name = escapeHtml(s.source || 'source');
        const stance = s.stance ? `<span class="chip ${s.stance === 'support' ? 'success' : s.stance === 'refute' ? 'danger' : 'neutral'}" style="font-size:10px;padding:1px 6px">${escapeHtml(s.stance)}</span>` : '';
        const link = s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-2)">${name}</a>` : name;
        return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px">
            ${link} ${stance}
            <span class="note" style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml((s.snippet || '').slice(0, 110))}</span>
        </div>`;
    }).join('');
    const overridden = data.overriddenByWeb
        ? '<div class="note" style="font-size:11px;margin-top:6px">ℹ️ The AI classifier disagreed, but live internet evidence took precedence.</div>'
        : '';
    return `<div class="card" style="margin-top:10px;padding:12px 14px;border-color:rgba(109,94,247,.35)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:1.1rem">${icon}</span>
        <span class="badge ${cls}" style="font-size:12px">${headline}</span>
      </div>
      ${wv.reasoning ? `<p class="note" style="margin:8px 0 4px;font-size:12px">${escapeHtml(wv.reasoning)}</p>` : ''}
      ${rows ? `<div style="margin-top:6px">${rows}</div>` : ''}
      ${overridden}
    </div>`;
}

function buildResultCard(raw, kind) {
    const data = normalizeApiPrediction(raw);
    const vi = verdictInfo(data);
    const pct = Math.round(Number(data.confidence) * 100);
    const warning = pct < 62
        ? '<div class="verdict-warning">⚠️ Low confidence — treat this result cautiously and verify manually.</div>'
        : (data.source === 'heuristic' ? '<div class="verdict-warning">ℹ️ Heuristic fallback used — AI model was not loaded.</div>' : '');
    return `<div class="card result reveal">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:1.8rem">${vi.icon}</span>
        <div>
          <span class="badge ${vi.badgeClass}" style="font-size:1rem;padding:4px 14px">${vi.display}</span>
          <div class="note" style="margin-top:4px;font-size:12px">${vi.desc}</div>
        </div>
        <span class="chip ${vi.badgeClass}" style="margin-left:auto">${pct}% confidence</span>
      </div>
      <div class="progress mt-3"><div class="bar ${vi.barClass}" style="width:${pct}%"></div></div>
      ${warning}
      ${_buildWebVerificationPanel(data)}
      ${_buildSourcePanel(data, kind)}
      <div class="feedback-strip" id="feedback-strip-${kind}">
        <span class="note" style="font-size:12px">Was this correct?</span>
        <button class="feedback-btn" onclick="sendFeedback('correct','${kind}')" title="System was correct">✓ Correct</button>
        <button class="feedback-btn danger" onclick="sendFeedback('wrong','${kind}')" title="System was wrong">✗ Wrong</button>
        <button class="feedback-btn" onclick="sendFeedback('unsure','${kind}')" title="Not sure">? Unsure</button>
      </div>
    </div>`;
}

// Store last prediction id per tab kind for feedback
const _lastPredId = {};

async function sendFeedback(feedbackLabel, kind) {
    const predId = _lastPredId[kind];
    const strip = document.getElementById('feedback-strip-' + kind);
    if (!predId) { if (strip) strip.innerHTML = '<span class="note">No prediction saved yet.</span>'; return; }
    try {
        await authFetch('/api/feedback', { method: 'POST', body: JSON.stringify({ predictionId: predId, label: feedbackLabel, comment: '' }) });
        if (strip) strip.innerHTML = `<span class="note" style="color:var(--success)">✓ Feedback recorded — thank you!</span>`;
    } catch (err) { if (strip) strip.innerHTML = `<span class="note">${err?.message || 'Feedback failed.'}</span>`; }
}
function redirectToLogin(target) {
    const url = (() => {
        try { return new URL(target || '/', window.location.origin); }
        catch { return new URL('/', window.location.origin); }
    })();
    const returnUrl = encodeURIComponent(url.pathname + url.search);
    window.location.href = '/login.html' + (returnUrl ? `?returnUrl=${returnUrl}` : '');
}

async function authFetch(url, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 429) {
        const payload = await res.json().catch(() => ({}));
        const retryAfter = res.headers.get('Retry-After');
        throw new Error(payload.error || (retryAfter
            ? `Too many requests. Please wait ${retryAfter} seconds and try again.`
            : 'Too many requests. Please wait a moment and try again.'));
    }
    if (res.status === 401) throw new Error('Unauthorized');
    return res;
}

function updateNavAuth() {
    const logged = !!getToken();
    document.querySelectorAll('[data-when="guest"]').forEach(el => {
        el.style.display = logged ? 'none' : (el.dataset.display || 'inline');
    });
    document.querySelectorAll('[data-when="auth"]').forEach(el => {
        el.style.display = logged ? (el.dataset.display || 'inline') : 'none';
    });
}

function ensureHomeLinks() {
    document.querySelectorAll('header nav').forEach(nav => {
        if (!nav.querySelector('a[href="/"]')) {
            const home = document.createElement('a');
            home.href = '/';
            home.textContent = 'Home';
            nav.insertBefore(home, nav.firstChild);
        }
    });
}

function getReturnUrl() {
    const m = location.search.match(/[?&]returnUrl=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (res.status === 429) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Too many registration attempts. Please wait and try again.');
    }
    if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        throw new Error((Array.isArray(t) ? t.join(', ') : t?.message) || 'Registration failed');
    }
    // Do not auto-login after registration; send user to login page.
    await res.json().catch(() => ({}));
    const ret = getReturnUrl();
    const q = ret ? ('?returnUrl=' + encodeURIComponent(ret)) : '';
    window.location.href = '/login.html' + q;
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (res.status === 429) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Too many login attempts. Please wait and try again.');
    }
    if (!res.ok) throw new Error('Invalid credentials');
    const data = await res.json();
    // Accept either camelCase or PascalCase from backend
    setToken(data.token || data.Token);
    const ret = getReturnUrl();
    window.location.href = ret || '/dashboard.html';
}

async function handlePredictText(e) {
    e.preventDefault();
    const text = document.getElementById('text-input').value.trim();
    const out = document.getElementById('text-output');
    out.innerHTML = '<div class="note"><span class="spinner"></span> Classifying text…</div>';
    try {
        const res = await authFetch('/api/predict/text', {
            method: 'POST', body: JSON.stringify({ text })
        });
        const data = normalizeApiPrediction(await res.json());
        if (data.predictionId) _lastPredId.text = data.predictionId;
        const pct = Math.round(Number(data.confidence) * 100);
        const cardHtml = buildResultCard(data, 'text');
        out.innerHTML = cardHtml;
        const last = document.getElementById('last-result'); if (last) last.innerHTML = cardHtml;
        addRecent({ kind: 'text', label: data.verdictCategory || data.label, confidence: pct });
        // Show explain button
        const explBtn = document.getElementById('explain-btn');
        if (explBtn) explBtn.style.display = 'inline-flex';
    } catch (err) {
        out.innerHTML = `<div class="alert error">${err.message || err}</div>`;
    }
}

async function loadHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    try {
        const res = await authFetch('/api/history');
        const items = await res.json();
        tbody.innerHTML = items.map(x => {
            const isFake = x.result === 'Fake';
            const pct = Math.round(Number(x.confidence) * 100);
            return `
            <tr>
                <td>${new Date(x.timestamp).toLocaleString()}</td>
                <td><span class="chip">${x.contentType}</span></td>
                <td><span class="badge ${isFake ? 'danger' : 'success'}">${x.result}</span></td>
                <td>
                    <div class="progress compact"><div class="bar ${isFake ? 'danger' : 'success'}" style="width:${pct}%"></div></div>
                    <span class="note">${pct}%</span>
                </td>
                <td title="${x.inputPathOrText || ''}">${(x.inputPathOrText || '').slice(0, 60)}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="alert error">${err.message || err}</div></td></tr>`;
    }
}

function bindPageHandlers() {
    ensureHomeLinks();
    updateNavAuth();
    const regForm = document.getElementById('register-form');
    if (regForm) regForm.addEventListener('submit', e => handleRegister(e).catch(err => showFormError('register-error', err)));
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', e => handleLogin(e).catch(err => showFormError('login-error', err)));
    const textForm = document.getElementById('text-form');
    if (textForm) textForm.addEventListener('submit', handlePredictText);
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { clearToken(); updateNavAuth(); window.location.href = '/'; });
    if (document.getElementById('history-tbody') && !window.__historyHandled) loadHistory();

    document.querySelectorAll('[data-requires-auth="true"]').forEach(link => {
        link.addEventListener('click', evt => {
            if (getToken()) return;
            evt.preventDefault();
            redirectToLogin(link.getAttribute('href'));
        });
    });

    // Reveal-on-scroll for elements marked with [data-reveal]
    const toReveal = document.querySelectorAll('[data-reveal]');
    if (toReveal.length) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('reveal'); io.unobserve(e.target); } });
        }, { threshold: 0.08 });
        toReveal.forEach(el => io.observe(el));
    }

    // Render a professional, consistent footer (site-wide)
    renderFooter();
}

function renderFooter() {
    try {
        const root = document.querySelector('.footer .container');
        if (!root) return;
        root.innerHTML = `
            <div class="footer-grid">
                <div class="footer-brand">
                    <a class="brand" href="/"><img class="logo-img" src="/img/logo.svg" alt="Deepfake News Detector logo"/><span>Deepfake News Detector</span></a>
                    <p class="note">AI-powered screening for news text and URLs with calibrated confidence and private history.</p>
                </div>
            </div>
            <div class="footer-meta">
                <div>© <span id="y"></span> Deepfake News Detector</div>
                <div class="note">
                    <a href="/privacy.html">Privacy Policy</a>
                    • <a href="/support.html">Contact Us</a>
                    • <strong>For academic use only</strong>
                </div>
            </div>
        `;
        const y = root.querySelector('#y'); if (y) y.textContent = new Date().getFullYear();
    } catch { }
}

// Simple in-memory recent list
const recent = [];
function addRecent(item) {
    recent.unshift({ ts: new Date(), ...item });
    if (recent.length > 10) recent.pop();
    const list = document.getElementById('recent-list');
    if (list) {
        list.innerHTML = recent.map(r => `
                    <div class="recent-item" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0">
                        <span class="chip">${r.kind}</span>
                        <span class="badge ${r.label === 'Fake' ? 'danger' : 'success'}">${r.label}</span>
                        <span class="note">${r.confidence}%</span>
                    </div>
                `).join('');
    }
}

function showFormError(id, err) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="alert error">${err.message || err}</div>`;
}

document.addEventListener('DOMContentLoaded', bindPageHandlers);
