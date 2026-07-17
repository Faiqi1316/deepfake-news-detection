/* analytics.js — Full analytics page: stats, donut, bars, timeline */
(function () {
  'use strict';

  function getToken() { return localStorage.getItem('jwt') || ''; }
  function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

  async function authGet(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Too many requests. Please wait and try again.');
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const VERDICT_COLORS = {
    'Likely Fake':    '#ef4444',
    'Likely Real':    '#22c55e',
    'Misleading':     '#f59e0b',
    'Satire/Opinion': '#3b82f6',
    'Inconclusive':   '#6b7280'
  };

  function renderRing(container, segments) {
    if (!container) return;
    const r = 52, cx = 68, cy = 68, sw = 14;
    const circ = 2 * Math.PI * r;
    let off = 0;
    const arcs = segments.map(s => {
      const d = (s.value / 100) * circ;
      const a = { ...s, off, d };
      off += d;
      return a;
    });
    container.innerHTML = `<div class="ring-chart">
      <svg width="136" height="136" viewBox="0 0 136 136">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${sw}"/>
        ${arcs.map(a => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${a.color}"
          stroke-width="${sw}" stroke-dasharray="${a.d.toFixed(2)} ${(circ - a.d).toFixed(2)}"
          stroke-dashoffset="${(-(a.off - circ / 4)).toFixed(2)}" stroke-linecap="round"/>`).join('')}
        <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="var(--text)" font-size="18" font-weight="700">${segments[0]?.value ?? 0}%</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="var(--muted)" font-size="11">${segments[0]?.label ?? ''}</text>
      </svg>
      <div class="ring-legend">
        ${segments.map(s => `<div class="ring-legend-item">
          <span class="ring-dot" style="background:${s.color}"></span>
          <span>${s.label}: ${s.value}%</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function renderVerdictCatBars(container, categories, total) {
    if (!container) return;
    if (!categories || !categories.length) { container.innerHTML = '<p class="note">No verdict data yet</p>'; return; }
    const max = Math.max(...categories.map(c => c.count), 1);
    container.innerHTML = '<div class="bar-chart">' +
      categories.map(c => {
        const p = Math.round(c.count / max * 100);
        const pctOfTotal = total ? Math.round(c.count / total * 100) : 0;
        const color = VERDICT_COLORS[c.category] || '#6b7280';
        return `<div class="bar-row">
          <span class="bar-label" style="color:${color};font-weight:600">${c.category}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${color}"></div></div>
          <span class="bar-value">${c.count} <span class="note" style="font-size:10px">(${pctOfTotal}%)</span></span>
        </div>`;
      }).join('') + '</div>';
  }

  function renderBars(container, items, lk, ck) {
    if (!container) return;
    if (!items || !items.length) { container.innerHTML = '<p class="note">No data yet</p>'; return; }
    const max = Math.max(...items.map(i => i[ck]), 1);
    container.innerHTML = '<div class="bar-chart">' +
      items.map(it => {
        const p = Math.round(it[ck] / max * 100);
        return `<div class="bar-row">
          <span class="bar-label">${it[lk]}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>
          <span class="bar-value">${it[ck]}</span>
        </div>`;
      }).join('') + '</div>';
  }

  function renderCalibChart(container, weeks) {
    if (!container) return;
    const active = weeks.filter(w => w.total > 0);
    if (!active.length) {
      container.innerHTML = '<p class="note">No feedback submitted yet — use the ✓ / ✗ buttons after each prediction to build calibration data.</p>';
      return;
    }
    const cells = weeks.map(w => {
      if (w.total === 0) {
        return `<div class="calib-col">
          <div class="calib-bar-wrap"><div class="calib-bar" style="height:4px;background:var(--border)"></div></div>
          <span class="calib-label">${w.week}</span>
        </div>`;
      }
      const pct = w.agreementPct ?? 0;
      const h = Math.max(6, Math.round(pct * 0.80));
      const cls = pct >= 70 ? 'success' : pct >= 50 ? 'warn' : 'danger';
      return `<div class="calib-col">
        <span class="calib-pct" style="color:var(--${cls})">${pct}%</span>
        <div class="calib-bar-wrap"><div class="calib-bar ${cls}" style="height:${h}px"></div></div>
        <span class="calib-label">${w.week}</span>
        <span class="calib-n">${w.correct}/${w.total}</span>
      </div>`;
    }).join('');
    container.innerHTML = `<div class="calib-chart">${cells}</div>
      <div class="note" style="margin-top:8px;font-size:11px">Each bar = % of weekly feedback where AI was correct. Green ≥ 70%, yellow 50-70%, red &lt; 50%.</div>`;
  }

  function renderTimeline(container, days) {
    if (!container) return;
    if (!days || !days.length) { container.innerHTML = '<p class="note">No recent activity</p>'; return; }
    const max = Math.max(...days.map(d => d.count), 1);
    const bars = days.map(d => {
      const h = Math.max(3, Math.round(d.count / max * 72));
      return `<div class="act-bar" style="height:${h}px" title="${d.date}: ${d.count}"></div>`;
    }).join('');
    const total = days.reduce((s, d) => s + d.count, 0);
    container.innerHTML = `<div class="activity-timeline">${bars}</div>
      <div class="note" style="margin-top:6px;font-size:11px">Last 30 days — ${total} analyses performed</div>`;
  }

  async function init() {
    let stats;
    try {
      stats = await authGet('/api/analytics');
    } catch (e) {
      const body = document.getElementById('analytics-body');
      if (body) body.insertAdjacentHTML('afterbegin', `<div class="alert error" style="margin-bottom:16px">Failed to load analytics: ${e.message}</div>`);
      return;
    }

    const total = stats.total || 0;
    setText('an-total', total);
    setText('an-fake', stats.fake || 0);
    setText('an-real', stats.real || 0);
    setText('an-conf', (stats.avgConfidence || 0) + '%');
    setText('an-week', stats.recent7 || 0);

    const byCategory = stats.verdictByCategory || [];

    // Build 5-category donut segments
    const ringSegments = byCategory.map(c => ({
      label: c.category,
      value: total ? Math.round(c.count / total * 100) : 0,
      color: VERDICT_COLORS[c.category] || '#6b7280'
    }));
    if (!ringSegments.length) {
      ringSegments.push({ label: 'No data', value: 100, color: 'var(--border)' });
    }
    renderRing(document.getElementById('verdict-ring'), ringSegments);
    renderVerdictCatBars(document.getElementById('verdict-cat-bars'), byCategory, total);

    renderBars(document.getElementById('type-bars'), stats.byType || [], 'type', 'count');
    renderTimeline(document.getElementById('activity-tl'), stats.last30Days || []);

    // Calibration summary badges
    const calibSummary = document.getElementById('calib-summary');
    if (calibSummary) {
      const totalFeedback = stats.totalFeedbacks ?? 0;
      const agr   = stats.overallAgreement;
      const agrCls = agr == null ? 'neutral' : agr >= 70 ? 'success' : agr >= 50 ? 'warn' : 'danger';
      calibSummary.innerHTML = `
        <div class="source-item">
          <span class="source-label">Total Feedback</span>
          <span class="source-value" style="font-size:1.4rem;font-weight:700">${totalFeedback}</span>
        </div>
        <div class="source-item">
          <span class="source-label">Overall Agreement</span>
          <span class="source-value">${agr != null ? `<span class="badge ${agrCls}" style="font-size:1rem;padding:4px 14px">${agr}%</span>` : '<span class="badge neutral">No data yet</span>'}</span>
        </div>
        <div class="source-item">
          <span class="source-label">Min to calibrate</span>
          <span class="source-value">12 feedbacks per model/verdict group</span>
        </div>`;
    }
    renderCalibChart(document.getElementById('calib-chart'), stats.calibrationTrend || []);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
