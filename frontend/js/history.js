/* history.js — Enhanced history page with filters, stats bar, and CSV export */
(function () {
  'use strict';

  // Signal to app.js that we handle history loading ourselves
  window.__historyHandled = true;

  function getToken() { return localStorage.getItem('jwt') || ''; }
  function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
  }

  let allItems = [];

  function updateStats(items) {
    const total = items.length;
    const fake = items.filter(x => x.result === 'Fake').length;
    const real = total - fake;
    const avg = total ? Math.round(items.reduce((s, x) => s + x.confidence, 0) / total * 100) : 0;
    setText('hs-total', total);
    setText('hs-fake', fake);
    setText('hs-real', real);
    setText('hs-avg', avg + '%');
  }

  function _vcBadge(x) {
    const vc = (x.verdictCategory || x.result || '').toLowerCase();
    if (vc.includes('likely fake') || vc.includes('fake')) return ['danger', x.verdictCategory || x.result];
    if (vc.includes('likely real') || vc.includes('real')) return ['success', x.verdictCategory || x.result];
    if (vc.includes('mislead')) return ['warn', x.verdictCategory || 'Misleading'];
    if (vc.includes('satire'))  return ['info', x.verdictCategory || 'Satire'];
    if (vc.includes('inconcl')) return ['neutral', 'Inconclusive'];
    return [x.result === 'Fake' ? 'danger' : 'success', x.result];
  }

  function renderTable(items) {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="note" style="padding:24px;text-align:center">No predictions match the current filters.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(x => {
      const [cls, display] = _vcBadge(x);
      const pct = Math.round(x.confidence * 100);
      return `<tr>
        <td>${new Date(x.timestamp).toLocaleString()}</td>
        <td><span class="chip">${escHtml(x.contentType)}</span></td>
        <td><span class="badge ${cls}">${escHtml(display)}</span></td>
        <td>
          <div class="row-progress">
            <div class="row-bar ${cls === 'danger' ? 'danger-bar' : cls === 'success' ? 'success-bar' : 'warn-bar'}" style="width:${pct}%"></div>
          </div>
          <span class="note" style="font-size:12px">${pct}%</span>
        </td>
        <td class="note" title="${escHtml(x.inputPathOrText || '')}">${escHtml((x.inputPathOrText || '').slice(0, 60))}</td>
      </tr>`;
    }).join('');
  }

  function getFilteredItems() {
    const typeVal = (document.getElementById('filter-type')?.value || '').trim();
    const verdictVal = (document.getElementById('filter-verdict')?.value || '').trim();
    const searchVal = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
    return allItems.filter(x => {
      if (typeVal && x.contentType !== typeVal) return false;
      if (verdictVal && x.result !== verdictVal) return false;
      if (searchVal && !(x.inputPathOrText || '').toLowerCase().includes(searchVal)) return false;
      return true;
    });
  }

  function applyFilters() {
    const filtered = getFilteredItems();
    updateStats(filtered);
    renderTable(filtered);
  }

  async function exportCSV() {
    const typeVal = (document.getElementById('filter-type')?.value || '').trim();
    const verdictVal = (document.getElementById('filter-verdict')?.value || '').trim();
    const searchVal = (document.getElementById('filter-search')?.value || '').trim();
    const params = new URLSearchParams();
    if (typeVal) params.set('type', typeVal);
    if (verdictVal) params.set('verdict', verdictVal);
    if (searchVal) params.set('search', searchVal);

    const btn = document.getElementById('export-csv-btn');
    const prevText = btn?.textContent || 'Export CSV';
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting...'; }
    try {
      const res = await fetch('/api/history/export.csv?' + params.toString(), {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Too many export requests. Please wait and try again.');
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/i);
      const filename = m?.[1] || 'deepfake-history.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || 'Export failed');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevText; }
    }
  }

  async function init() {
    try {
      const res = await fetch('/api/history', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Too many history requests. Please wait and try again.');
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      allItems = await res.json();
    } catch (e) {
      const tbody = document.getElementById('history-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="5"><div class="alert error">Failed to load history: ${escHtml(e.message)}</div></td></tr>`;
      return;
    }

    updateStats(allItems);
    renderTable(allItems);

    document.getElementById('filter-apply-btn')?.addEventListener('click', applyFilters);
    document.getElementById('filter-reset-btn')?.addEventListener('click', () => {
      const t = document.getElementById('filter-type');
      const v = document.getElementById('filter-verdict');
      const s = document.getElementById('filter-search');
      if (t) t.value = '';
      if (v) v.value = '';
      if (s) s.value = '';
      applyFilters();
    });
    document.getElementById('filter-search')?.addEventListener('keypress', e => {
      if (e.key === 'Enter') applyFilters();
    });
    document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
