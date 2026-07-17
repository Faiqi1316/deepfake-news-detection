(function () {
  'use strict';

  const txt = document.getElementById('fc-text');
  const btn = document.getElementById('fc-run');
  const statusEl = document.getElementById('fc-status');
  const resultsEl = document.getElementById('fc-results');
  const sourceStatusEl = document.getElementById('fc-source-status');

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g,
      s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[s]);
  }

  function toCardClass(verdict) {
    const v = String(verdict || '').toLowerCase();
    if (v.includes('support')) return 'supported';
    if (v.includes('refut') || v.includes('false')) return 'refuted';
    return 'inconclusive';
  }

  function verdictBadge(verdict) {
    const v = String(verdict || '').toLowerCase();
    if (v.includes('refut') || v.includes('false')) return '<span class="badge danger">Refuted</span>';
    if (v.includes('support') || v.includes('true')) return '<span class="badge success">Supported</span>';
    return '<span class="badge">Inconclusive</span>';
  }

  function scoreTone(score) {
    const value = Number(score);
    if (Number.isNaN(value)) return '#7b8a96';
    if (value >= 70) return '#19a974';
    if (value >= 40) return '#f59e0b';
    return '#e11d48';
  }

  function scoreLabel(score) {
    const value = Math.max(1, Math.min(100, Number(score) || 50));
    if (value >= 80) return 'Strongly supported';
    if (value >= 60) return 'Likely supported';
    if (value >= 40) return 'Uncertain';
    if (value >= 20) return 'Likely false';
    return 'Strongly false';
  }

  function renderSourceStatus(meta) {
    if (!sourceStatusEl) return;
    const mode = String(meta?.mode || 'fallback');
    const tone = mode === 'automated' ? 'success' : 'warn';
    sourceStatusEl.className = `alert ${tone}`;
    sourceStatusEl.style.display = 'block';
    const modeLabel = mode === 'automated'
      ? 'Automated verification with source-backed evidence'
      : 'Fallback verification (limited sources)';
    sourceStatusEl.innerHTML = `<strong>Fact-check:</strong> ${esc(modeLabel)}`;
  }

  function renderSourceGroup(title, list, tone) {
    if (!list || !list.length) {
      return `<div class="src-item"><span class="trust-dot ${tone}"></span><div><strong>${title}:</strong> <span class="note">No sources found</span></div></div>`;
    }
    return list.map(s => `
      <div class="src-item">
        <span class="trust-dot ${tone}"></span>
        <div>
          <a href="${esc(s.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-2)">${esc(s.source || 'source')}</a>
          <div class="note" style="font-size:12px">${esc(s.snippet || '').slice(0, 170)}</div>
        </div>
      </div>
    `).join('');
  }

  function render(data) {
    if (!data) {
      resultsEl.innerHTML = '<div class="alert error">No response data returned.</div>';
      return;
    }

    renderSourceStatus(data.meta || {});

    const claims = data.claims || [];
    const overall = data.overallVerdict || 'Inconclusive';
    const topConfidence = claims.length ? Number(claims[0]?.confidence || 0) : 0.5;
    const overallScore = Math.max(1, Math.min(100, Math.round(topConfidence * 100)));
    const ovClass = toCardClass(overall);

    let html = `
      <div class="verdict-banner ${ovClass}" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <div class="note" style="font-size:11px">Overall Fact-Check Verdict</div>
            <div style="font-size:1.2rem;font-weight:700">${esc(overall)}</div>
          </div>
          <div style="text-align:right">
            <div>${verdictBadge(overall)}</div>
            <div class="chip" style="margin-top:6px">${overallScore}/100</div>
          </div>
        </div>
        <div style="margin-top:10px">
          <div style="height:9px;border-radius:999px;background:#e5e7eb;overflow:hidden">
            <div style="height:100%;width:${overallScore}%;background:${scoreTone(overallScore)}"></div>
          </div>
          <div class="note" style="font-size:12px;margin-top:6px">${esc(scoreLabel(overallScore))} on a 1 to 100 claim-strength scale.</div>
        </div>
      </div>
    `;

    if (!claims.length) {
      html += '<div class="card"><p class="note" style="margin:0">No claim blocks were extracted from the text.</p></div>';
      resultsEl.innerHTML = html;
      return;
    }

    html += claims.map((c, i) => {
      const cls = toCardClass(c.verdict);
      const conf = Math.round((c.confidence || 0) * 100);
      const score = Math.max(1, Math.min(100, Math.round((Number(c.confidence) || 0.5) * 100)));
      const supporting = c.supportingSources || [];
      const refuting = c.refutingSources || [];
      const neutral = c.neutralSources || [];

      return `
        <div class="claim-block ${cls}" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <h3 style="margin:0;font-size:1rem">Claim ${i + 1}</h3>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${verdictBadge(c.verdict)}
              <span class="chip">${score}/100 score</span>
              <span class="chip">${conf}% confidence</span>
            </div>
          </div>
          <p style="margin:8px 0 10px;line-height:1.6">${esc(c.claim || '')}</p>
          ${Array.isArray(c.incorrectParts) && c.incorrectParts.length ? `
            <div class="card" style="margin:0 0 10px;background:#fff8f8;border:1px solid #fbd5d5">
              <div style="font-weight:700;margin-bottom:6px">Potentially incorrect parts</div>
              <ul class="list" style="margin:0;padding-left:18px">
                ${c.incorrectParts.map(p => `<li>${esc(p)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          ${c.correctedInfo ? `
            <div class="card" style="margin:0 0 10px;background:#f7fbff;border:1px solid #d8e8ff">
              <div style="font-weight:700;margin-bottom:6px">Corrected information</div>
              <div class="note" style="white-space:pre-wrap">${esc(c.correctedInfo)}</div>
            </div>
          ` : ''}

            <div style="margin:0 0 12px">
            <div style="height:9px;border-radius:999px;background:#e5e7eb;overflow:hidden">
              <div style="height:100%;width:${score}%;background:${scoreTone(score)}"></div>
            </div>
              <div class="note" style="font-size:12px;margin-top:6px">${esc(scoreLabel(score))} on a 1 to 100 claim-strength scale.</div>
            </div>

          <div class="src-trust-list">
            ${renderSourceGroup('Supporting Evidence', supporting, 'high')}
            ${renderSourceGroup('Refuting Evidence', refuting, 'low')}
            ${renderSourceGroup('Neutral / Context', neutral, 'mid')}
          </div>
          <details style="margin-top:8px">
            <summary style="cursor:pointer">Reasoning</summary>
            <div class="note" style="margin-top:6px;white-space:pre-wrap">${esc(c.reasoning || 'No reasoning provided.')}</div>
          </details>
        </div>
      `;
    }).join('');

    if (data.disclaimer) {
      html += `<div class="disclaimer" style="margin-top:10px">${esc(data.disclaimer)}</div>`;
    }
    resultsEl.innerHTML = html;
  }

  async function run() {
    const text = (txt?.value || '').trim();
    if (!text) {
      statusEl.textContent = 'Enter text first.';
      return;
    }

    btn.disabled = true;
    statusEl.innerHTML = '<span class="spinner"></span> Running fact-check...';
    resultsEl.innerHTML = '';

    try {
      const resp = await fetch('/api/factcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (resp.status === 429) {
        const payload = await resp.json().catch(() => ({}));
        throw new Error(payload.error || 'Too many fact-check requests. Please wait and try again.');
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      render(data);
      statusEl.textContent = 'Done.';
    } catch (err) {
      statusEl.textContent = 'Error.';
      resultsEl.innerHTML = `<div class="alert error">Fact-check failed: ${esc(err.message || String(err))}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  if (btn) btn.addEventListener('click', run);
})();
