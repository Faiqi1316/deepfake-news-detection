/* analyze-url.js — Handles analyze-url.html page logic */
(function () {
  'use strict';

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

  function renderResult(data) {
    const isFake = data.label === 'Fake';
    const pct = Math.round((data.confidence || 0) * 100);
    const investigateHref = data.url ? `/investigate.html?url=${encodeURIComponent(data.url)}` : '/investigate.html';
    return `<div class="article-preview">
      <div class="article-title">${escHtml(data.title || 'No title extracted')}</div>
      <div class="article-meta">
        <a href="${escHtml(data.url)}" target="_blank" rel="noopener noreferrer"
           style="color:var(--primary-2);font-size:12px">${escHtml(data.url.slice(0, 90))}</a>
        &nbsp;•&nbsp;
        <span>${data.char_count || 0} characters extracted</span>
      </div>
      <div class="article-snippet note" style="margin-top:8px">${escHtml(data.snippet || '')}</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="verdict-xl ${isFake ? 'danger' : 'success'}">${isFake ? '⚠️ Fake' : '✅ Real'}</div>
        <div>
          <div style="font-size:13px;color:var(--muted)">Confidence</div>
          <div style="font-size:1.5rem;font-weight:700">${pct}%</div>
        </div>
        <div style="flex:1">
          <div class="progress">
            <div class="bar ${isFake ? 'danger' : 'success'}" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
      <div class="note" style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
        <span>Model: <strong>${escHtml(data.source || 'model')}</strong></span>
        <a href="/fact-check.html" style="color:var(--primary-2)">→ Run full fact-check on this article</a>
        <a href="${investigateHref}" style="color:var(--primary-2)">→ Open investigation report</a>
        <a href="/predict.html" style="color:var(--primary-2)">→ Analyze text manually</a>
      </div>
    </div>`;
  }

  async function run() {
    const urlInput = document.getElementById('url-input');
    const btn = document.getElementById('url-btn');
    const status = document.getElementById('url-status');
    const resultEl = document.getElementById('url-result');
    const url = (urlInput?.value || '').trim();

    if (!url) {
      if (status) status.textContent = 'Please enter a URL first.';
      return;
    }

    btn.disabled = true;
    if (status) status.innerHTML = '<span class="spinner"></span> Fetching article…';
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

    try {
      const data = await authPost('/api/predict/url', { url });
      if (data.error) throw new Error(data.error);
      if (resultEl) {
        resultEl.innerHTML = renderResult(data);
        resultEl.style.display = 'block';
      }
      if (status) status.textContent = 'Done.';
    } catch (e) {
      if (resultEl) {
        resultEl.innerHTML = `<div class="alert error">Error: ${escHtml(e.message)}</div>`;
        resultEl.style.display = 'block';
      }
      if (status) status.textContent = 'Failed.';
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('url-btn');
    if (btn) btn.addEventListener('click', run);

    const input = document.getElementById('url-input');
    if (input) input.addEventListener('keypress', e => { if (e.key === 'Enter') run(); });

    // Sample URL buttons
    document.querySelectorAll('[data-sample-url]').forEach(b => {
      b.addEventListener('click', () => {
        const input2 = document.getElementById('url-input');
        if (input2) { input2.value = b.dataset.sampleUrl; input2.focus(); }
      });
    });
  });
})();
