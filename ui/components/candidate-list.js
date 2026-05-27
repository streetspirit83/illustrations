/**
 * CandidateList – renders the main table of trading candidates.
 */
import { STATE_LABELS, SIGNAL_TYPE_LABELS } from '../lib/schema.js';

export class CandidateList {
  constructor(containerEl) {
    this._container = containerEl;
    this._sortKey   = 'discovered_at';
    this._sortDir   = 'desc'; // 'asc' | 'desc'
    this._onSelect  = null;
    this._onAction  = null;
    this._candidates = [];
  }

  /**
   * Render the candidate table.
   * @param {object[]} candidates
   * @param {(candidate: object) => void} onSelect   Row click / eye icon
   * @param {(action: string, candidate: object) => void} onAction  'promote'|'dismiss'|'review'|'toggle-check'|'check-all'
   */
  render(candidates, onSelect, onAction) {
    this._candidates = candidates;
    this._onSelect   = onSelect;
    this._onAction   = onAction;
    this._buildTable();
  }

  /** Update a single row in-place (avoids full re-render flickering). */
  updateRow(candidateId, updatedCandidate) {
    const idx = this._candidates.findIndex(c => c.id === candidateId);
    if (idx !== -1) this._candidates[idx] = updatedCandidate;
    const row = this._container.querySelector(`tr[data-id="${candidateId}"]`);
    if (!row) return;
    // Re-render just this row's cells
    this._refreshRow(row, updatedCandidate);
  }

  _buildTable() {
    const sorted = this._sortCandidates([...this._candidates]);

    if (!sorted.length) {
      this._container.innerHTML = `
        <div class="list-container">
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">Keine Kandidaten</div>
            <div class="empty-state-desc">
              Es wurden keine Kandidaten gefunden, die den aktiven Filtern entsprechen.
            </div>
          </div>
        </div>`;
      return;
    }

    this._container.innerHTML = `
      <div class="list-container">
        <div class="list-header">
          <span class="list-header-title">Kandidaten</span>
          <span class="list-count">${sorted.length} Eintr${sorted.length !== 1 ? 'äge' : 'ag'}</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="candidate-table" role="grid" aria-label="Kandidatenliste">
            <thead>
              <tr>
                <th class="col-check" role="columnheader">
                  <input type="checkbox" class="check-input" id="check-all" aria-label="Alle auswählen">
                </th>
                <th class="${this._sortKey === 'workspace_state' ? 'sorted' : ''}" data-sort="workspace_state" role="columnheader" aria-sort="${this._sortAria('workspace_state')}">
                  Status <i class="sort-icon">${this._sortIcon('workspace_state')}</i>
                </th>
                <th class="${this._sortKey === 'symbol' ? 'sorted' : ''}" data-sort="symbol" role="columnheader" aria-sort="${this._sortAria('symbol')}">
                  Symbol <i class="sort-icon">${this._sortIcon('symbol')}</i>
                </th>
                <th class="col-name" role="columnheader">Name</th>
                <th class="col-sources" role="columnheader">Quellen</th>
                <th class="col-signal ${this._sortKey === '_signalType' ? 'sorted' : ''}" data-sort="_signalType" role="columnheader">
                  Signal <i class="sort-icon">${this._sortIcon('_signalType')}</i>
                </th>
                <th class="col-date ${this._sortKey === 'discovered_at' ? 'sorted' : ''}" data-sort="discovered_at" role="columnheader" aria-sort="${this._sortAria('discovered_at')}">
                  Entdeckt <i class="sort-icon">${this._sortIcon('discovered_at')}</i>
                </th>
                <th role="columnheader">Aktionen</th>
              </tr>
            </thead>
            <tbody id="candidate-tbody">
              ${sorted.map(c => this._rowHTML(c)).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    this._attachEvents();
  }

  _rowHTML(c) {
    const state    = c.workspace_state || 'new';
    const stateLabel = STATE_LABELS[state] || state;
    const sources  = c.sources || [];
    const latestSignal = this._latestSignalType(sources);
    const discoveredAt = this._formatDate(c.discovered_at);
    const hasEnrichment = !!c.enrichment;

    return `
      <tr data-id="${this._esc(c.id)}" role="row" tabindex="0" aria-label="${this._esc(c.symbol)} ${this._esc(c.name || '')}">
        <td class="col-check" role="gridcell">
          <input type="checkbox" class="check-input row-check" data-id="${this._esc(c.id)}"
                 aria-label="${this._esc(c.symbol)} auswählen">
        </td>
        <td role="gridcell">
          <span class="badge state-badge state-${state}" title="${stateLabel}">${stateLabel}</span>
        </td>
        <td role="gridcell">
          <div class="symbol-cell">
            <span class="symbol">${this._esc(c.symbol)}</span>
            <span class="exchange">${this._esc(c.exchange)}</span>
            ${hasEnrichment
              ? `<span class="enrichment-dot has-enrichment" title="Angereichert" aria-label="Angereichert"></span>`
              : `<span class="enrichment-dot no-enrichment"  title="Nicht angereichert" aria-label="Nicht angereichert"></span>`
            }
          </div>
        </td>
        <td class="col-name" role="gridcell">
          <span style="font-size:0.83rem;color:var(--text-secondary);">${this._esc(c.name || '—')}</span>
        </td>
        <td class="col-sources sources-cell" role="gridcell">
          ${sources.slice(0, 3).map(s =>
            `<span class="badge adapter-chip" style="${this._adapterChipStyle(s.adapter)}">${this._esc(s.adapter)}</span>`
          ).join('')}
          ${sources.length > 3 ? `<span class="badge mcap-badge">+${sources.length - 3}</span>` : ''}
        </td>
        <td class="col-signal signal-cell" role="gridcell">
          ${latestSignal
            ? `<span class="badge signal-chip signal-${latestSignal}">${SIGNAL_TYPE_LABELS[latestSignal] || latestSignal}</span>`
            : '<span class="text-muted">—</span>'
          }
        </td>
        <td class="col-date date-cell" role="gridcell">${discoveredAt}</td>
        <td class="actions-cell" role="gridcell">
          <button class="btn btn-ghost btn-icon action-detail" data-id="${this._esc(c.id)}"
                  title="Details anzeigen" aria-label="${this._esc(c.symbol)} Details">
            👁
          </button>
          ${state !== 'promoted' && state !== 'imported' ? `
          <button class="btn btn-ghost btn-icon action-promote" data-id="${this._esc(c.id)}"
                  title="Promoten" aria-label="${this._esc(c.symbol)} promoten"
                  style="color:var(--success);font-size:0.85rem;">
            ↑
          </button>` : ''}
          ${state !== 'dismissed' ? `
          <button class="btn btn-ghost btn-icon action-dismiss" data-id="${this._esc(c.id)}"
                  title="Ablehnen" aria-label="${this._esc(c.symbol)} ablehnen"
                  style="color:var(--error);font-size:0.85rem;">
            ✗
          </button>` : ''}
        </td>
      </tr>`;
  }

  _refreshRow(row, c) {
    const newHtml = this._rowHTML(c);
    const tmp = document.createElement('tbody');
    tmp.innerHTML = newHtml;
    const newRow = tmp.firstElementChild;
    // Preserve selected state
    if (row.classList.contains('selected')) newRow.classList.add('selected');
    const cb = newRow.querySelector('.row-check');
    if (cb && row.querySelector('.row-check')?.checked) cb.checked = true;
    row.replaceWith(newRow);
    this._attachRowEvents(newRow);
  }

  _attachEvents() {
    const container = this._container;

    // Sort headers
    container.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const key = th.dataset.sort;
        if (this._sortKey === key) {
          this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this._sortKey = key;
          this._sortDir = 'desc';
        }
        this._buildTable();
      });
    });

    // Check all
    const checkAll = container.querySelector('#check-all');
    if (checkAll) {
      checkAll.addEventListener('change', () => {
        const checked = checkAll.checked;
        container.querySelectorAll('.row-check').forEach(cb => { cb.checked = checked; });
        container.querySelectorAll('tr[data-id]').forEach(tr => {
          tr.classList.toggle('selected', checked);
        });
        if (this._onAction) {
          this._onAction('check-all', { checked });
        }
      });
    }

    // Row events
    container.querySelectorAll('tr[data-id]').forEach(row => {
      this._attachRowEvents(row);
    });
  }

  _attachRowEvents(row) {
    const id = row.dataset.id;
    const candidate = this._candidates.find(c => c.id === id);
    if (!candidate) return;

    // Row click (but not on action buttons or checkbox)
    row.addEventListener('pointerup', (e) => {
      if (e.target.closest('.actions-cell') || e.target.classList.contains('check-input')) return;
      e.preventDefault();
      if (this._onSelect) this._onSelect(candidate);
    });

    // Keyboard: Enter/Space
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this._onSelect) this._onSelect(candidate);
      }
    });

    // Detail button
    const detailBtn = row.querySelector('.action-detail');
    if (detailBtn) {
      detailBtn.addEventListener('pointerup', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this._onSelect) this._onSelect(candidate);
      });
    }

    // Promote button
    const promoteBtn = row.querySelector('.action-promote');
    if (promoteBtn) {
      promoteBtn.addEventListener('pointerup', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this._onAction) this._onAction('promote', candidate);
      });
    }

    // Dismiss button
    const dismissBtn = row.querySelector('.action-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('pointerup', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this._onAction) this._onAction('dismiss', candidate);
      });
    }

    // Row checkbox
    const cb = row.querySelector('.row-check');
    if (cb) {
      cb.addEventListener('change', () => {
        row.classList.toggle('selected', cb.checked);
        if (this._onAction) this._onAction('toggle-check', { id, checked: cb.checked });
      });
      // Prevent row click when clicking checkbox
      cb.addEventListener('pointerup', (e) => e.stopPropagation());
    }
  }

  // --- Sort ---

  _sortCandidates(candidates) {
    return candidates.sort((a, b) => {
      let valA, valB;

      switch (this._sortKey) {
        case 'discovered_at':
          valA = new Date(a.discovered_at || 0).getTime();
          valB = new Date(b.discovered_at || 0).getTime();
          break;
        case 'symbol':
          valA = (a.symbol || '').toLowerCase();
          valB = (b.symbol || '').toLowerCase();
          break;
        case 'workspace_state':
          valA = (a.workspace_state || '').toLowerCase();
          valB = (b.workspace_state || '').toLowerCase();
          break;
        case '_sourceCount':
          valA = (a.sources || []).length;
          valB = (b.sources || []).length;
          break;
        case '_signalType':
          valA = this._latestSignalType(a.sources || '') || '';
          valB = this._latestSignalType(b.sources || '') || '';
          break;
        default:
          return 0;
      }

      if (valA < valB) return this._sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return this._sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  _sortIcon(key) {
    if (this._sortKey !== key) return '↕';
    return this._sortDir === 'asc' ? '↑' : '↓';
  }

  _sortAria(key) {
    if (this._sortKey !== key) return 'none';
    return this._sortDir === 'asc' ? 'ascending' : 'descending';
  }

  // --- Helpers ---

  _latestSignalType(sources) {
    if (!sources || !sources.length) return null;
    const sorted = [...sources].sort((a, b) =>
      new Date(b.discovered_at || 0) - new Date(a.discovered_at || 0)
    );
    return sorted[0].signal_type || null;
  }

  _formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: '2-digit'
      });
    } catch (_) { return iso; }
  }

  _adapterChipStyle(adapter) {
    const colors = [
      '#ff8a65,rgba(255,138,101,0.15)',
      '#81c784,rgba(129,199,132,0.15)',
      '#64b5f6,rgba(100,181,246,0.15)',
      '#ce93d8,rgba(206,147,216,0.15)',
      '#ffb74d,rgba(255,183,77,0.15)',
      '#4dd0e1,rgba(77,208,225,0.15)',
      '#f06292,rgba(240,98,146,0.15)',
    ];
    let hash = 0;
    for (let i = 0; i < (adapter || '').length; i++)
      hash = (hash * 31 + adapter.charCodeAt(i)) & 0xffffffff;
    const [fg, bg] = colors[Math.abs(hash) % colors.length].split(',');
    return `color:${fg};background:${bg};border-color:${fg}40`;
  }

  _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
