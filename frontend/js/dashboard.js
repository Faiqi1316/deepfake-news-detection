/* dashboard.js — Loads stats, charts, and recent predictions for dashboard.html */
(function () {
  'use strict';

  function getToken() { return localStorage.getItem('jwt') || ''; }
  function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  const VERDICT_COLORS = {
    'Likely Fake': '#ef4444',
    'Likely Real': '#22c55e',
    'Misleading': '#f59e0b',
    'Satire/Opinion': '#3b82f6',
    'Inconclusive': '#6b7280'
  };

  function verdictInfo(item) {
    const v = (item.verdictCategory || item.result || '').toLowerCase();
    if (v.includes('likely fake') || v === 'fake') return { text: item.verdictCategory || 'Likely Fake', badge: 'danger', bar: 'danger-bar' };
    if (v.includes('likely real') || v === 'real') return { text: item.verdictCategory || 'Likely Real', badge: 'success', bar: 'success-bar' };
    if (v.includes('mislead')) return { text: 'Misleading', badge: 'warn', bar: 'warn-bar' };
    if (v.includes('satire')) return { text: 'Satire/Opinion', badge: 'info', bar: 'warn-bar' };
    return { text: item.verdictCategory || 'Inconclusive', badge: 'neutral', bar: 'warn-bar' };
  }

  async function authGet(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Too many dashboard requests. Please wait and try again.');
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // ── SVG ring / donut chart ────────────────────────────────────────────────
  function renderDonut(container, segments) {
    if (!container) return;
    const r = 46, cx = 62, cy = 62, sw = 13;
    const circ = 2 * Math.PI * r;
    let off = 0;
    const arcs = segments.map(s => {
      const dash = (s.value / 100) * circ;
      const arc = { ...s, off, dash };
      off += dash;
      return arc;
    });
    const svgArcs = arcs.map(a =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${a.color}" stroke-width="${sw}"
        stroke-dasharray="${a.dash.toFixed(2)} ${(circ - a.dash).toFixed(2)}"
        stroke-dashoffset="${(-(a.off - circ / 4)).toFixed(2)}"
        stroke-linecap="round"/>`
    ).join('');
    const legend = segments.map(s =>
      `<div class="ring-legend-item">
        <span class="ring-dot" style="background:${s.color}"></span>
        <span>${s.label}: ${s.value}%</span>
      </div>`
    ).join('');
    container.innerHTML = `<div class="ring-chart">
      <svg width="124" height="124" viewBox="0 0 124 124">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${sw}"/>
        ${svgArcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text)" font-size="15" font-weight="700">${segments[0]?.value ?? 0}%</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="var(--muted)" font-size="10">${segments[0]?.label || ''}</text>
      </svg>
      <div class="ring-legend">${legend}</div>
    </div>`;
  }

  // ── Bar chart ─────────────────────────────────────────────────────────────
  function renderBars(container, items, labelKey, countKey) {
    if (!container) return;
    if (!items || !items.length) { container.innerHTML = '<p class="note">No data yet</p>'; return; }
    const maxVal = Math.max(...items.map(i => i[countKey]), 1);
    container.innerHTML = '<div class="bar-chart">' +
      items.map(item => {
        const pct = Math.round(item[countKey] / maxVal * 100);
        return `<div class="bar-row">
          <span class="bar-label">${item[labelKey]}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="bar-value">${item[countKey]}</span>
        </div>`;
      }).join('') + '</div>';
  }

  // ── 30-day activity timeline ──────────────────────────────────────────────
  function renderTimeline(container, days) {
    if (!container) return;
    if (!days || !days.length) { container.innerHTML = '<p class="note">No recent activity</p>'; return; }
    const maxCount = Math.max(...days.map(d => d.count), 1);
    const bars = days.map(d => {
      const h = Math.max(3, Math.round(d.count / maxCount * 58));
      return `<div class="act-bar" style="height:${h}px" title="${d.date}: ${d.count} predictions"></div>`;
    }).join('');
    const total = days.reduce((s, d) => s + d.count, 0);
    container.innerHTML = `<div class="activity-timeline">${bars}</div>
      <div class="note" style="margin-top:6px;font-size:11px">Last 30 days — ${total} total analyses</div>`;
  }

  // ── Recent predictions table ──────────────────────────────────────────────
  async function loadRecentTable() {
    const tbody = document.getElementById('dash-recent');
    if (!tbody) return;
    try {
      const history = await authGet('/api/history');
      const rows = history.slice(0, 5);
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="note" style="padding:20px;text-align:center">No predictions yet. <a href="/predict.html" style="color:var(--primary-2)">Run your first analysis →</a></td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(x => {
        const vi = verdictInfo(x);
        const pct = Math.round(x.confidence * 100);
        return `<tr>
          <td class="note">${new Date(x.timestamp).toLocaleDateString()}</td>
          <td><span class="chip">${x.contentType}</span></td>
          <td><span class="badge ${vi.badge}">${vi.text}</span></td>
          <td>
            <div class="row-progress">
              <div class="row-bar ${vi.bar}" style="width:${pct}%"></div>
            </div>
            <span class="note" style="font-size:11px">${pct}%</span>
          </td>
          <td class="note" title="${(x.inputPathOrText || '').replace(/"/g, '&quot;')}">${(x.inputPathOrText || '').slice(0, 50)}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5"><div class="alert error">${e.message}</div></td></tr>`;
    }
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  async function init() {
    // Greet user
    try {
      const me = await authGet('/api/auth/me');
      const el = document.getElementById('dash-user');
      if (el && me) {
        const name = me.user || me.email || me.userName || '';
        el.textContent = name.split('@')[0] || 'User';
      }
    } catch { /* non-critical */ }

    // Load analytics
    let stats;
    try {
      stats = await authGet('/api/analytics');
    } catch (e) {
      console.error('Analytics load failed:', e);
      return;
    }

    const total = stats.total || 0;
    setText('stat-total', total);
    const byCategory = stats.verdictByCategory || [];
    const likelyFake = byCategory.find(x => x.category === 'Likely Fake')?.count || stats.fake || 0;
    const likelyReal = byCategory.find(x => x.category === 'Likely Real')?.count || stats.real || 0;
    setText('stat-fake', likelyFake);
    setText('stat-real', likelyReal);
    setText('stat-conf', (stats.avgConfidence || 0) + '%');
    setText('stat-recent7', (stats.recent7 || 0) + ' this week');

    // 5-category donut chart
    const ringSegments = byCategory.map(c => ({
      label: c.category,
      value: total ? Math.round(c.count / total * 100) : 0,
      color: VERDICT_COLORS[c.category] || '#6b7280'
    }));
    if (!ringSegments.length) ringSegments.push({ label: 'No data', value: 100, color: '#334155' });
    renderDonut(document.getElementById('verdict-donut'), ringSegments);

    // Bar chart
    renderBars(document.getElementById('type-bars'), stats.byType || [], 'type', 'count');

    // Timeline
    renderTimeline(document.getElementById('activity-timeline'), stats.last30Days || []);

    // Recent table
    await loadRecentTable();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
