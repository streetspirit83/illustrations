/**
 * app.js – Discovery Workspace main application
 */
import { StorageClient } from './lib/storage-client.js';
import { enrichCandidate } from './lib/claude-api.js';
import { BLOB_NAMES, WORKSPACE_STATES } from './lib/schema.js';
import { SettingsModal }   from './components/settings-modal.js';
import { UploadModal }     from './components/upload-modal.js';
import { CandidateDetail } from './components/candidate-detail.js';
import { CandidateList }   from './components/candidate-list.js';

// ============================================================
// Global toast utility (used by CandidateDetail too)
// ============================================================
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.innerHTML = `<span class="toast-icon">${iconMap[type] || 'ℹ'}</span><span>${_escHtml(message)}</span>`;

  container.appendChild(toast);

  const duration = type === 'error' ? 5000 : 3000;
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 250);
  }, duration);
};

function _escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// App class
// ============================================================
class App {
  constructor() {
    this.storageClient  = new StorageClient();
    this.settingsModal  = new SettingsModal();
    this.uploadModal    = new UploadModal();
    this.candidateDetail = null; // init after DOM ready
    this.candidateList  = null;

    // State
    this.allCandidates  = [];      // master list (current blob)
    this.currentBlobKey = 'INBOX'; // 'INBOX' | 'ARCHIVE' | 'EXPORT'
    this.selectedIds    = new Set();

    this.filters = {
      state:     'all',
      region:    'all',
      dateRange: 'all',
      search:    '',
      adapter:   'all',
    };

    this._searchTimer = null;
  }

  // ----------------------------------------------------------
  async init() {
    this.candidateDetail = new CandidateDetail();
    this.candidateList   = new CandidateList(document.getElementById('list-root'));

    this._setupHeaderActions();
    this._setupFilterBar();
    this._setupBulkBar();
    this._setupBlobTabs();

    // First-visit check
    if (this.settingsModal.isFirstVisit()) {
      this.settingsModal.show(() => {
        this.storageClient.refresh();
        this._updateMockBanner();
        this._loadData();
      });
    }

    this._updateMockBanner();
    await this._loadData();
  }

  // ----------------------------------------------------------
  // Data loading
  // ----------------------------------------------------------
  async _loadData() {
    this._showLoading(true);
    try {
      if (!this.storageClient.isMockMode()) {
        const blobName = BLOB_NAMES[this.currentBlobKey];
        const blob = await this.storageClient.readBlob(blobName);
        if (blob && Array.isArray(blob.candidates)) {
          this.allCandidates = blob.candidates;
          this._render();
          return;
        }
      }
      // Fallback to mock data
      await this._loadMockData();
    } catch (err) {
      console.warn('Backend load failed, falling back to mock:', err);
      window.showToast(`Backend nicht erreichbar, lade Mock-Daten (${err.message})`, 'warning');
      await this._loadMockData();
    } finally {
      this._showLoading(false);
    }
  }

  async _loadMockData() {
    try {
      const res  = await fetch('./mock/inbox.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.json();
      this.allCandidates = blob.candidates || [];
      this._render();
    } catch (err) {
      window.showToast(`Fehler beim Laden der Mock-Daten: ${err.message}`, 'error');
      this.allCandidates = [];
      this._render();
    }
  }

  // ----------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------
  _render() {
    const filtered = this._applyFilters(this.allCandidates);
    this.candidateList.render(
      filtered,
      (candidate) => this._openDetail(candidate),
      (action, payload) => this._handleListAction(action, payload)
    );
  }

  _applyFilters(candidates) {
    let result = [...candidates];

    // Blob-level state filter
    if (this.currentBlobKey === 'INBOX') {
      result = result.filter(c =>
        c.workspace_state === 'new' || c.workspace_state === 'reviewed'
      );
    } else if (this.currentBlobKey === 'ARCHIVE') {
      result = result.filter(c => c.workspace_state === 'dismissed');
    } else if (this.currentBlobKey === 'EXPORT') {
      result = result.filter(c =>
        c.workspace_state === 'promoted' || c.workspace_state === 'imported'
      );
    }

    // State filter
    if (this.filters.state !== 'all') {
      result = result.filter(c => c.workspace_state === this.filters.state);
    }

    // Adapter filter
    if (this.filters.adapter !== 'all') {
      result = result.filter(c =>
        (c.sources || []).some(s => s.adapter === this.filters.adapter)
      );
    }

    // Region filter
    if (this.filters.region !== 'all') {
      result = result.filter(c => {
        const region = this._guessRegion(c.exchange);
        return region === this.filters.region;
      });
    }

    // Date range filter
    if (this.filters.dateRange !== 'all') {
      const cutoff = this._dateCutoff(this.filters.dateRange);
      if (cutoff) {
        result = result.filter(c => new Date(c.discovered_at) >= cutoff);
      }
    }

    // Search filter
    if (this.filters.search) {
      const q = this.filters.search.toLowerCase();
      result = result.filter(c =>
        (c.symbol  || '').toLowerCase().includes(q) ||
        (c.name    || '').toLowerCase().includes(q) ||
        (c.isin    || '').toLowerCase().includes(q) ||
        (c.exchange|| '').toLowerCase().includes(q)
      );
    }

    return result;
  }

  _guessRegion(exchange) {
    if (!exchange) return 'other';
    const ex = exchange.toUpperCase();
    if (ex === 'NASDAQ' || ex === 'NYSE') return 'US';
    if (ex === 'XETR') return 'DE';
    if (ex === 'EURONEXT' || ex === 'LSE' || ex === 'XPAR' || ex === 'XAMS') return 'EU';
    return 'other';
  }

  _dateCutoff(range) {
    const now = new Date();
    switch (range) {
      case '24h': return new Date(now - 24 * 60 * 60 * 1000);
      case '7d':  return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000);
      default:    return null;
    }
  }

  // ----------------------------------------------------------
  // Detail drawer
  // ----------------------------------------------------------
  _openDetail(candidate) {
    this.candidateDetail.show(candidate, async (id, patch) => {
      await this._applyPatch(id, patch);
    });
  }

  // ----------------------------------------------------------
  // Actions
  // ----------------------------------------------------------
  async _handleListAction(action, payload) {
    switch (action) {
      case 'promote':
        await this._promoteCandidate(payload);
        break;
      case 'dismiss':
        await this._dismissCandidate(payload);
        break;
      case 'review':
        await this._applyPatch(payload.id, { workspace_state: 'reviewed' });
        break;
      case 'toggle-check': {
        const { id, checked } = payload;
        if (checked) this.selectedIds.add(id);
        else         this.selectedIds.delete(id);
        this._updateBulkBar();
        break;
      }
      case 'check-all': {
        const filtered = this._applyFilters(this.allCandidates);
        if (payload.checked) {
          filtered.forEach(c => this.selectedIds.add(c.id));
        } else {
          this.selectedIds.clear();
        }
        this._updateBulkBar();
        break;
      }
    }
  }

  async _promoteCandidate(candidate) {
    await this._applyPatch(candidate.id, { workspace_state: 'promoted' });
    // Move from inbox to export
    if (!this.storageClient.isMockMode()) {
      await this.storageClient.moveCandidate(
        candidate.id,
        BLOB_NAMES.INBOX,
        BLOB_NAMES.EXPORT
      ).catch(err => console.warn('moveCandidate failed:', err));
    }
    window.showToast(`${candidate.symbol} promoted`, 'success');
    this._render();
  }

  async _dismissCandidate(candidate) {
    await this._applyPatch(candidate.id, { workspace_state: 'dismissed' });
    // Move from inbox to archive
    if (!this.storageClient.isMockMode()) {
      await this.storageClient.moveCandidate(
        candidate.id,
        BLOB_NAMES.INBOX,
        BLOB_NAMES.ARCHIVE
      ).catch(err => console.warn('moveCandidate failed:', err));
    }
    window.showToast(`${candidate.symbol} abgelehnt`, 'info');
    this._render();
  }

  async _applyPatch(id, patch) {
    // Update in-memory
    const idx = this.allCandidates.findIndex(c => c.id === id);
    if (idx !== -1) {
      Object.assign(this.allCandidates[idx], patch);
      // Update list row
      this.candidateList.updateRow(id, this.allCandidates[idx]);
    }

    // Persist to backend
    if (!this.storageClient.isMockMode()) {
      const blobName = BLOB_NAMES[this.currentBlobKey];
      await this.storageClient.updateCandidate(blobName, id, patch)
        .catch(err => console.warn('updateCandidate failed:', err));
    }

    // If drawer is open with this candidate, refresh it
    if (this.candidateDetail) {
      const updated = this.allCandidates.find(c => c.id === id);
      if (updated) this.candidateDetail.refresh(updated);
    }
  }

  // ----------------------------------------------------------
  // Upload
  // ----------------------------------------------------------
  _openUpload() {
    this.uploadModal.show(async (blob) => {
      await this._importBlob(blob);
    });
  }

  async _importBlob(blob) {
    const candidates = blob.candidates || [];
    let successCount = 0;
    let failCount    = 0;

    this._showLoading(true);
    try {
      for (const candidate of candidates) {
        // Deduplicate by id
        const existing = this.allCandidates.findIndex(c => c.id === candidate.id);
        if (existing !== -1) {
          this.allCandidates[existing] = candidate;
        } else {
          this.allCandidates.push(candidate);
        }

        if (!this.storageClient.isMockMode()) {
          try {
            await this.storageClient.appendCandidate(BLOB_NAMES.INBOX, candidate);
            successCount++;
          } catch (e) {
            failCount++;
            console.warn('appendCandidate failed:', e);
          }
        } else {
          successCount++;
        }
      }

      this._render();
      const msg = this.storageClient.isMockMode()
        ? `${successCount} Kandidat(en) importiert (Mock-Modus)`
        : `${successCount} importiert${failCount ? `, ${failCount} fehlgeschlagen` : ''}`;
      window.showToast(msg, failCount ? 'warning' : 'success');
    } finally {
      this._showLoading(false);
    }
  }

  // ----------------------------------------------------------
  // Bulk actions
  // ----------------------------------------------------------
  async _bulkDismiss() {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    for (const id of ids) {
      const c = this.allCandidates.find(x => x.id === id);
      if (c) await this._dismissCandidate(c);
    }
    this.selectedIds.clear();
    this._updateBulkBar();
    this._render();
  }

  async _bulkPromote() {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    for (const id of ids) {
      const c = this.allCandidates.find(x => x.id === id);
      if (c) await this._promoteCandidate(c);
    }
    this.selectedIds.clear();
    this._updateBulkBar();
    this._render();
  }

  async _bulkEnrich() {
    const apiKey = localStorage.getItem('claude_api_key') || '';
    if (!apiKey) {
      window.showToast('Kein Claude API Key konfiguriert. Bitte in den Einstellungen eingeben.', 'error');
      return;
    }

    const ids = [...this.selectedIds];
    const toEnrich = ids
      .map(id => this.allCandidates.find(c => c.id === id))
      .filter(c => c && !c.enrichment);

    if (!toEnrich.length) {
      window.showToast('Alle ausgewählten Kandidaten sind bereits angereichert.', 'info');
      return;
    }

    const progressEl = document.getElementById('bulk-enrich-progress');
    const enrichBtn  = document.getElementById('bulk-enrich-btn');
    enrichBtn.disabled = true;

    let done = 0;
    const total = toEnrich.length;
    progressEl.textContent = `0 / ${total} angereichert`;
    progressEl.style.display = '';

    for (const candidate of toEnrich) {
      try {
        const enrichment = await enrichCandidate(candidate, apiKey);
        await this._applyPatch(candidate.id, { enrichment });
        done++;
        progressEl.textContent = `${done} / ${total} angereichert`;
      } catch (err) {
        window.showToast(`Enrichment für ${candidate.symbol} fehlgeschlagen: ${err.message}`, 'error');
      }
    }

    progressEl.textContent = '';
    progressEl.style.display = 'none';
    enrichBtn.disabled = false;
    window.showToast(`${done} von ${total} Kandidaten angereichert`, done === total ? 'success' : 'warning');
  }

  // ----------------------------------------------------------
  // UI Setup
  // ----------------------------------------------------------
  _setupHeaderActions() {
    document.getElementById('btn-upload').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._openUpload();
    });

    document.getElementById('btn-settings').addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.settingsModal.show(() => {
        this.storageClient.refresh();
        this._updateMockBanner();
        this._loadData();
      });
    });

    document.getElementById('btn-refresh').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._loadData();
    });
  }

  _setupBlobTabs() {
    document.querySelectorAll('.tab-btn[data-blob]').forEach(btn => {
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const key = btn.dataset.blob;
        this.currentBlobKey = key;
        this.selectedIds.clear();
        this._updateBulkBar();
        document.querySelectorAll('.tab-btn[data-blob]').forEach(b =>
          b.classList.toggle('active', b.dataset.blob === key)
        );
        this._loadData();
      });
    });
  }

  _setupFilterBar() {
    // State filter
    document.getElementById('filter-state').addEventListener('change', (e) => {
      this.filters.state = e.target.value;
      this._render();
    });

    // Adapter filter
    document.getElementById('filter-adapter').addEventListener('change', (e) => {
      this.filters.adapter = e.target.value;
      this._render();
    });

    // Region pills
    document.querySelectorAll('.region-pill').forEach(pill => {
      pill.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const region = pill.dataset.region;
        this.filters.region = region;
        document.querySelectorAll('.region-pill').forEach(p =>
          p.classList.toggle('active', p.dataset.region === region)
        );
        this._render();
      });
    });

    // Date range pills
    document.querySelectorAll('.date-pill').forEach(pill => {
      pill.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const range = pill.dataset.range;
        this.filters.dateRange = range;
        document.querySelectorAll('.date-pill').forEach(p =>
          p.classList.toggle('active', p.dataset.range === range)
        );
        this._render();
      });
    });

    // Search
    document.getElementById('filter-search').addEventListener('input', (e) => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this.filters.search = e.target.value.trim();
        this._render();
      }, 300);
    });
  }

  _setupBulkBar() {
    document.getElementById('bulk-dismiss-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._bulkDismiss();
    });
    document.getElementById('bulk-promote-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._bulkPromote();
    });
    document.getElementById('bulk-enrich-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._bulkEnrich();
    });
    document.getElementById('bulk-clear-btn').addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.selectedIds.clear();
      this._updateBulkBar();
      // Uncheck all checkboxes
      document.querySelectorAll('.row-check').forEach(cb => { cb.checked = false; });
      document.querySelectorAll('tr[data-id]').forEach(tr => tr.classList.remove('selected'));
      const checkAll = document.getElementById('check-all');
      if (checkAll) checkAll.checked = false;
    });
  }

  _updateBulkBar() {
    const bar      = document.getElementById('bulk-bar');
    const countEl  = document.getElementById('bulk-selected-count');
    const n = this.selectedIds.size;

    if (n > 0) {
      bar.classList.add('visible');
      if (document.getElementById('mock-banner').classList.contains('visible')) {
        bar.classList.add('with-banner');
      }
      countEl.innerHTML = `<strong>${n}</strong> ausgewählt`;
    } else {
      bar.classList.remove('visible');
    }
  }

  _updateMockBanner() {
    const banner = document.getElementById('mock-banner');
    const isMock = this.storageClient.isMockMode();
    banner.classList.toggle('visible', isMock);

    // Shift filter bar and main content
    const filterBar  = document.getElementById('filter-bar');
    const mainContent = document.getElementById('main-content');
    filterBar.classList.toggle('with-banner', isMock);
    mainContent.classList.toggle('with-banner', isMock);
  }

  _showLoading(show) {
    const el = document.getElementById('list-root');
    if (show) {
      el.innerHTML = `
        <div class="list-container">
          <div class="page-loading">
            <div class="spinner spinner-lg"></div>
            <span>Lade Kandidaten…</span>
          </div>
        </div>`;
    }
  }
}

// ============================================================
// Bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const app = new App();
  await app.init();
  window._app = app; // expose for debugging
});
