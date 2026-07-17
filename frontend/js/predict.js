/* predict.js — Tab switching, explain, URL analysis */
(function () {
  'use strict';

  // ── helpers ──────────────────────────────────────────────────────────────
  function getToken() { return localStorage.getItem('jwt') || ''; }
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
  }
  async function authPost(url, body) {
    const token = getToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        token ? { Authorization: `Bearer ${token}` } : {}),
      body: JSON.stringify(body)
    });
    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      const retryAfter = res.headers.get('Retry-After');
      throw new Error(err.error || (retryAfter
        ? `Too many requests. Please wait ${retryAfter} seconds and try again.`
        : 'Too many requests. Please wait a moment and try again.'));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'HTTP ' + res.status);
    }
    return res.json();
  }

  // ── Tab switching ────────────────────────────────────────────────────────
  function initTabs() {
    const tabs = document.getElementById('predict-tabs');
    if (!tabs) return;
    function activateTab(name) {
      tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    }
    tabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    // honour URL hash e.g. predict.html#url
    const hash = location.hash.replace('#', '');
    if (['text', 'url'].includes(hash)) activateTab(hash);
  }

  // ── Character counter ────────────────────────────────────────────────────
  function initCharCounter() {
    const textarea = document.getElementById('text-input');
    const counter = document.getElementById('char-count');
    if (textarea && counter) {
      textarea.addEventListener('input', () => { counter.textContent = textarea.value.length + ' chars'; });
    }
  }

  // ── Show explain button once text result card appears ────────────────────
  function initExplainButton() {
    const textForm = document.getElementById('text-form');
    const explainBtn = document.getElementById('explain-btn');
    if (!textForm || !explainBtn) return;
    textForm.addEventListener('submit', () => {
      // Poll until app.js has rendered the result card
      const check = setInterval(() => {
        if (document.querySelector('#text-output .card')) {
          explainBtn.style.display = 'inline-flex';
          clearInterval(check);
        }
      }, 300);
      setTimeout(() => clearInterval(check), 10000);
    });
    explainBtn.addEventListener('click', handleExplain);
  }

  // ── Explain text ─────────────────────────────────────────────────────────
  async function handleExplain() {
    const text = document.getElementById('text-input')?.value?.trim();
    const out = document.getElementById('explain-output');
    const btn = document.getElementById('explain-btn');
    if (!text || !out) return;

    btn.disabled = true;
    btn.textContent = 'Loading...';
    out.innerHTML = '<div class="note"><span class="spinner"></span> Analyzing sentences…</div>';

    try {
      const data = await authPost('/api/predict/text/explain', { text });
      out.innerHTML = renderExplain(data);
    } catch (e) {
      out.innerHTML = `<div class="alert error">Explanation failed: ${escHtml(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Show Explanation';
    }
  }

  function renderExplain(data) {
    const sentences = data.sentences || [];
    if (!sentences.length) {
      return '<div class="card explain-panel"><p class="note">No sentence-level detail available.</p></div>';
    }
    const pct = Math.round((data.confidence || 0) * 100);
    const isFake = data.label === 'Fake';
    const overall = `<span class="badge ${isFake ? 'danger' : 'success'}">Overall: ${data.label} (${pct}%)</span>`;
    const fakeCnt = data.suspicious_count != null ? data.suspicious_count : sentences.filter(s => s.label === 'Fake').length;

    const ordered = [...sentences].sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    const top3 = new Set(ordered.slice(0, 3).map(s => s.text));
    const items = sentences.map(s => {
      const conf = Math.max(0, Math.min(1, Number(s.confidence) || 0));
      const heatAlpha = (0.10 + conf * 0.30).toFixed(2);
      const heatClass = s.label === 'Fake' ? 'hl-fake' : 'hl-real';
      const topCls = top3.has(s.text) ? ' top-signal' : '';
      const kws = (s.keywords || []).map(k => `<span class="kw-tag">${escHtml(k)}</span>`).join('');
      return `<div class="sentence-item ${heatClass}${topCls}" style="--heat-a:${heatAlpha}">
        <div class="sentence-text">${escHtml(s.text)}</div>
        <div class="sentence-meta">
          <span class="chip ${s.label === 'Fake' ? 'danger' : 'success'}" style="font-size:11px">${s.label} ${Math.round(conf * 100)}%</span>
          ${top3.has(s.text) ? '<span class="chip info" style="font-size:11px">Top signal</span>' : ''}
          ${kws}
        </div>
      </div>`;
    }).join('');

    return `<div class="card explain-panel">
      <h3 style="margin:0 0 8px">Sentence-Level Explanation</h3>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        ${overall}
        <span class="chip">${fakeCnt} / ${data.total_sentences || sentences.length} suspicious sentences</span>
        <span class="note" style="font-size:11px">Red tint = pushes toward Fake, green tint = pushes toward Real, darker = stronger signal</span>
      </div>
      <div class="explain-legend">
        <span class="legend-dot fake"></span><span class="legend-label">Fake-leaning sentence</span>
        <span class="legend-dot real"></span><span class="legend-label">Real-leaning sentence</span>
      </div>
      <div>${items}</div>
    </div>`;
  }

  // ── URL analysis (inline in predict page) ────────────────────────────────
  function initUrlPredict() {
    const btn = document.getElementById('url-predict-btn');
    const input = document.getElementById('url-input-predict');
    if (!btn) return;
    btn.addEventListener('click', handleUrlPredict);
    if (input) input.addEventListener('keypress', e => { if (e.key === 'Enter') handleUrlPredict(); });
  }

  async function handleUrlPredict() {
    const url = (document.getElementById('url-input-predict')?.value || '').trim();
    const out = document.getElementById('url-predict-output');
    const status = document.getElementById('url-predict-status');
    const btn = document.getElementById('url-predict-btn');
    if (!url || !out) return;

    btn.disabled = true;
    if (status) status.innerHTML = '<span class="spinner"></span> Fetching article…';
    out.innerHTML = '<div class="note"><span class="spinner"></span> Fetching and analyzing article…</div>';

    try {
      const data = await authPost('/api/predict/url', { url });
      if (data.error) throw new Error(data.error);
      out.innerHTML = renderUrlResult(data);
      if (status) status.textContent = 'Done.';
    } catch (e) {
      out.innerHTML = `<div class="alert error">Error: ${escHtml(e.message)}</div>`;
      if (status) status.textContent = 'Failed.';
    } finally {
      btn.disabled = false;
    }
  }

  function _vc(data) {
    const vc = (data.verdictCategory || '').toLowerCase();
    if (vc.includes('likely fake') || (!vc && data.label === 'Fake')) return { cls: 'danger', icon: '⚠️', label: 'Likely Fake' };
    if (vc.includes('likely real') || (!vc && data.label === 'Real')) return { cls: 'success', icon: '✅', label: 'Likely Real' };
    if (vc.includes('misleading'))  return { cls: 'warn',    icon: '🟡', label: 'Misleading' };
    if (vc.includes('satire'))      return { cls: 'info',    icon: '😄', label: 'Satire/Opinion' };
    return { cls: 'neutral', icon: '❓', label: 'Inconclusive' };
  }

  function renderUrlResult(data) {
    const pct = Math.round((data.confidence || 0) * 100);
    const v = _vc(data);
    const displayLabel = data.verdictCategory || v.label;
    const lowConf = pct < 60;
    return `<div class="article-preview">
      <div class="article-title">${escHtml(data.title || 'No title extracted')}</div>
      <div class="article-meta">
        <a href="${escHtml(data.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-2);font-size:12px">${escHtml(data.url.slice(0, 100))}</a>
        &nbsp;•&nbsp; <span>${data.char_count || 0} chars extracted</span>
      </div>
      <div class="article-snippet note" style="margin-top:6px">${escHtml(data.snippet || '')}</div>
    </div>
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="verdict-xl ${v.cls}">${v.icon} ${escHtml(displayLabel)}</div>
        <div>
          <div style="font-size:13px;color:var(--muted)">Confidence</div>
          <div style="font-size:1.4rem;font-weight:700">${pct}%</div>
        </div>
        <div style="flex:1">
          <div class="progress"><div class="bar ${v.cls}" style="width:${pct}%"></div></div>
        </div>
      </div>
      ${lowConf ? `<div class="verdict-warning" style="margin-top:10px">⚠️ Low confidence — treat this result with caution.</div>` : ''}
      ${(function(){
        const src = data.source || 'unknown';
        const isFallback = src === 'heuristic' || src.includes('fallback');
        const sample = Number(data.calibrationSampleSize || 0);
        const shift = Number(data.calibrationShift || 0);
        const calibrationBadge = Math.abs(shift) > 0.0001
          ? `<span class="badge ${shift > 0 ? 'success' : 'warn'}" style="font-size:11px;padding:2px 8px">${shift > 0 ? '+' : ''}${Math.round(shift * 100)} pts</span>`
          : '<span class="badge neutral" style="font-size:11px;padding:2px 8px">No shift</span>';
        const modelLabels = { 'local-logreg':'DeBERTa v3 + Logistic Regression (local)', 'zero-shot':'Zero-shot BART (HuggingFace)', 'heuristic':'Keyword heuristic (fallback)', 'DistilBERT':'DistilBERT (local)', 'HF-API':'HuggingFace Inference API' };
        const modelLabel = modelLabels[src] || src;
        const confTier = pct >= 80 ? 'High' : pct >= 60 ? 'Medium' : 'Low';
        const confCls  = pct >= 80 ? 'success' : pct >= 60 ? 'warn' : 'danger';
        return `<details class="source-panel">
          <summary>🔍 How was this determined?</summary>
          <div class="source-panel-grid">
            <div class="source-item"><span class="source-label">Model</span><span class="source-value">${escHtml(modelLabel)}</span></div>
            <div class="source-item"><span class="source-label">Input Type</span><span class="source-value">🔗 URL</span></div>
            <div class="source-item"><span class="source-label">Chars Extracted</span><span class="source-value">${data.char_count || 0}</span></div>
            <div class="source-item"><span class="source-label">Confidence Tier</span><span class="source-value"><span class="badge ${confCls}" style="font-size:11px;padding:2px 8px">${confTier} (${pct}%)</span></span></div>
            <div class="source-item"><span class="source-label">Fallback Used</span><span class="source-value">${isFallback ? '<span class="badge warn" style="font-size:11px;padding:2px 8px">Yes</span>' : '<span class="badge success" style="font-size:11px;padding:2px 8px">No</span>'}</span></div>
            <div class="source-item"><span class="source-label">Feedback Calibration</span><span class="source-value">${calibrationBadge}</span></div>
            <div class="source-item"><span class="source-label">Calibration Sample</span><span class="source-value">${sample > 0 ? sample + ' feedbacks' : 'Insufficient data'}</span></div>
          </div>
        </details>`;
      })()}
      <div class="note" style="margin-top:10px">
        <a href="/fact-check.html" style="color:var(--primary-2)">Run full fact-check on this article →</a>
      </div>
    </div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCharCounter();
    initExplainButton();
    initUrlPredict();
  });
})();
