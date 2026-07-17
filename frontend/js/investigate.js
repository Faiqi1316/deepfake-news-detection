(function () {
  'use strict';

  function getToken() { return localStorage.getItem('jwt') || ''; }
  function esc(str) {
    return String(str || '').replace(/[&<>"]'/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[s]);
  }

  function verdictMeta(v) {
    const t = String(v || '').toLowerCase();
    if (t.includes('likely fake') || t === 'fake') return { cls: 'danger', label: v || 'Likely Fake', icon: '⚠️' };
    if (t.includes('likely real') || t === 'real') return { cls: 'success', label: v || 'Likely Real', icon: '✅' };
    if (t.includes('mislead')) return { cls: 'warn', label: 'Misleading', icon: '🟡' };
    if (t.includes('satire')) return { cls: 'info', label: 'Satire/Opinion', icon: '😄' };
    return { cls: 'neutral', label: v || 'Inconclusive', icon: '❓' };
  }

  async function authPost(url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Too many requests. Please wait and try again.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function renderSummary(article, factcheck) {
    const articleVerdict = verdictMeta(article.verdictCategory || article.label);
    const overallVerdict = factcheck?.overallVerdict || 'Inconclusive';
    const overall = verdictMeta(overallVerdict);
    const claims = factcheck?.claims || [];
    const combinedNote = articleVerdict.label !== overall.label && overall.label !== 'Inconclusive'
      ? '<div class="verdict-warning" style="margin-top:12px">⚠️ The URL classifier and claim evidence do not fully agree. Human review is recommended.</div>'
      : '';

    return `
      <div class="card">
        <h3 style="margin:0 0 10px">Investigation Summary</h3>
        <div class="article-preview">
          <div class="article-title">${esc(article.title || 'No title extracted')}</div>
          <div class="article-meta">
            <a href="${esc(article.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-2);font-size:12px">${esc((article.url || '').slice(0, 95))}</a>
            &nbsp;•&nbsp;<span>${article.char_count || 0} characters extracted</span>
          </div>
          <div class="article-snippet note" style="margin-top:8px">${esc(article.snippet || '')}</div>
        </div>
        <div class="grid cols-2" style="margin-top:12px;gap:12px">
          <div class="card" style="margin:0;border-color:rgba(239,68,68,.18)">
            <div class="note" style="font-size:11px">URL Verdict</div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px">
              <span class="badge ${articleVerdict.cls}">${articleVerdict.icon} ${esc(articleVerdict.label)}</span>
              <span class="chip">${Math.round((article.confidence || 0) * 100)}% confidence</span>
            </div>
          </div>
          <div class="card" style="margin:0;border-color:rgba(59,130,246,.18)">
            <div class="note" style="font-size:11px">Evidence Verdict</div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px">
              <span class="badge ${overall.cls}">${overall.icon} ${esc(overall.label)}</span>
              <span class="chip">${claims.length} claims reviewed</span>
            </div>
          </div>
        </div>
        ${combinedNote}
      </div>`;
  }

  function renderFactCheck(factcheck) {
    const claims = factcheck?.claims || [];
    const overall = verdictMeta(factcheck?.overallVerdict || 'Inconclusive');
    if (!claims.length) {
      return `<div class="card" style="margin-top:12px">
        <h3 style="margin:0 0 8px">Evidence Report</h3>
        <div class="verdict-banner ${overall.cls}"><strong>${esc(factcheck?.overallVerdict || 'Inconclusive')}</strong></div>
        <p class="note" style="margin:10px 0 0">No claims were extracted from the article text.</p>
      </div>`;
    }

    const cards = claims.map((claim, idx) => {
      const claimVerdict = verdictMeta(claim.verdict || 'Inconclusive');
      const supporting = claim.supportingSources || [];
      const refuting = claim.refutingSources || [];
      const neutral = claim.neutralSources || [];
      return `
        <div class="claim-block ${claimVerdict.cls}" style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
            <strong>Claim ${idx + 1}</strong>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <span class="badge ${claimVerdict.cls}">${esc(claim.verdict || 'Inconclusive')}</span>
              <span class="chip">${Math.round((claim.confidence || 0) * 100)}%</span>
            </div>
          </div>
          <p style="margin:8px 0 10px;line-height:1.6">${esc(claim.claim || '')}</p>
          <div class="src-trust-list">
            <div class="src-item"><span class="trust-dot high"></span><div><strong>Supporting:</strong> <span class="note">${supporting.length}</span></div></div>
            <div class="src-item"><span class="trust-dot low"></span><div><strong>Refuting:</strong> <span class="note">${refuting.length}</span></div></div>
            <div class="src-item"><span class="trust-dot mid"></span><div><strong>Neutral:</strong> <span class="note">${neutral.length}</span></div></div>
          </div>
          <details style="margin-top:8px">
            <summary style="cursor:pointer">Reasoning and evidence</summary>
            <div class="note" style="margin-top:6px;white-space:pre-wrap">${esc(claim.reasoning || 'No reasoning provided.')}</div>
          </details>
        </div>`;
    }).join('');

    return `<div class="card" style="margin-top:12px">
      <h3 style="margin:0 0 8px">Evidence Report</h3>
      <div class="verdict-banner ${overall.cls}"><strong>${esc(factcheck?.overallVerdict || 'Inconclusive')}</strong></div>
      ${cards}
    </div>`;
  }

  async function run(urlValue) {
    const status = document.getElementById('inv-status');
    const summary = document.getElementById('inv-summary');
    const factcheck = document.getElementById('inv-factcheck');
    const url = (urlValue || '').trim();

    if (!url) {
      if (status) status.textContent = 'Please enter a URL first.';
      return;
    }

    if (status) status.innerHTML = '<span class="spinner"></span> Running URL analysis and fact-check...';
    if (summary) summary.innerHTML = '';
    if (factcheck) factcheck.innerHTML = '';

    try {
      const article = await authPost('/api/predict/url', { url });
      const bodyText = (article.articleText || article.snippet || article.title || '').trim();
      const fc = bodyText ? await authPost('/api/factcheck', { text: bodyText }) : { overallVerdict: 'Inconclusive', claims: [] };
      if (summary) summary.innerHTML = renderSummary(article, fc);
      if (factcheck) factcheck.innerHTML = renderFactCheck(fc);
      if (status) status.textContent = 'Done.';
    } catch (err) {
      if (summary) summary.innerHTML = `<div class="alert error">Investigation failed: ${esc(err.message || String(err))}</div>`;
      if (status) status.textContent = 'Failed.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('inv-url');
    const btn = document.getElementById('inv-run');
    if (btn) btn.addEventListener('click', () => run(input?.value || ''));
    if (input) input.addEventListener('keypress', e => { if (e.key === 'Enter') run(input.value || ''); });

    const params = new URLSearchParams(window.location.search);
    const url = params.get('url') || '';
    if (input && url) {
      input.value = url;
      run(url);
    }
  });
})();