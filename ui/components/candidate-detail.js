/**
 * CandidateDetail – slide-in drawer showing full candidate data.
 */
import { buildLinks } from '../lib/link-builder.js';
import { enrichCandidate } from '../lib/claude-api.js';
import { STATE_LABELS, SIGNAL_TYPE_LABELS, MARKET_CAP_LABELS, CONFIDENCE_LABELS } from '../lib/schema.js';

export class CandidateDetail {
  constructor() {
    this._drawer = document.getElementById('detail-drawer');
    this._candidate = null;
    this._onStateChange = null;
    this._notesSaveTimer = null;
    this._bindGlobalEvents();
  }

  /**
   * @param {object} candidate
   * @param {(id: string, patch: object) => Promise<void>} onStateChange
   */
  show(candidate, onStateChange) {
    this._candidate   = candidate;
    this._onStateChange = onStateChange;
    this._render();
    this._drawer.classList.add('open');
    document.getElementById('main-content').classList.add('drawer-open');
  }

  hide() {
    this._drawer.classList.remove('open');
    document.getElementById('main-content').classList.remove('drawer-open');
    this._candidate = null;
  }

  /** Re-render with updated candidate data (e.g. after enrichment). */
  refresh(candidate) {
    if (!this._candidate || this._candidate.id !== candidate.id) return;
    this._candidate = candidate;
    this._render();
    this._drawer.classList.add('open');
  }

  _bindGlobalEvents() {
    document.getElementById('drawer-close-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._drawer.classList.contains('open')) {
        this.hide();
      }
    });
  }

  _render() {
    const c = this._candidate;
    if (!c) return;

    // Header
    document.getElementById('drawer-symbol').textContent   = c.symbol;
    document.getElementById('drawer-exchange').textContent = c.exchange;
    document.getElementById('drawer-name').textContent     = c.name || '—';
    const isinEl = document.getElementById('drawer-isin');
    if (c.isin) { isinEl.textContent = c.isin; isinEl.style.display = ''; }
    else { isinEl.style.display = 'none'; }

    // State badge in header
    document.getElementById('drawer-state-badge').innerHTML =
      this._stateBadgeHTML(c.workspace_state);

    // Links
    const links = buildLinks({
      symbol: c.symbol,
      exchange: c.exchange,
      yahoo_symbol: c.yahoo_symbol || c.symbol
    });
    document.getElementById('link-tradingview').href = links.tradingview;
    document.getElementById('link-yahoo').href       = links.yahoo;
    document.getElementById('link-stocktwits').href  = links.stocktwits;

    // Sources
    this._renderSources(c.sources || []);

    // Notes
    const notesTA = document.getElementById('drawer-notes');
    notesTA.value = c.notes || '';
    notesTA.oninput = null;
    notesTA.onblur = () => this._saveNotes(notesTA.value);

    // Enrichment
    this._renderEnrichment(c);

    // Action bar
    this._renderActions(c);
  }

  _renderSources(sources) {
    const container = document.getElementById('drawer-sources');
    container.innerHTML = '';

    if (!sources.length) {
      container.innerHTML = '<p class="text-muted" style="font-size:0.83rem">Keine Quellen verfügbar.</p>';
      return;
    }

    sources.forEach((src, idx) => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.innerHTML = `
        <div class="source-header" role="button" aria-expanded="false" aria-controls="src-raw-${idx}">
          <div class="source-header-left">
            <span class="badge adapter-chip" style="${this._adapterChipStyle(src.adapter)}">${this._esc(src.adapter)}</span>
            <span class="badge signal-chip signal-${src.signal_type}">${SIGNAL_TYPE_LABELS[src.signal_type] || src.signal_type}</span>
          </div>
          <div class="source-header-right">
            <span class="date-cell">${this._formatDate(src.discovered_at)}</span>
            <span class="source-toggle-icon">▾</span>
          </div>
        </div>
        <div class="source-snippet">${this._esc(src.info_snippet || '')}</div>
        <div class="source-raw" id="src-raw-${idx}">
          <pre>${this._esc(JSON.stringify(src.raw_signal || {}, null, 2))}</pre>
        </div>
      `;

      const header = item.querySelector('.source-header');
      const raw    = item.querySelector('.source-raw');
      header.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const expanded = item.classList.toggle('expanded');
        raw.classList.toggle('expanded', expanded);
        header.setAttribute('aria-expanded', expanded);
      });

      container.appendChild(item);
    });
  }

  _renderEnrichment(c) {
    const emptySection   = document.getElementById('enrichment-empty');
    const loadingSection = document.getElementById('enrichment-loading');
    const contentSection = document.getElementById('enrichment-content');
    const enrichBtn      = document.getElementById('enrich-btn');

    // Reset
    loadingSection.classList.remove('visible');
    contentSection.classList.remove('visible');

    if (!c.enrichment) {
      emptySection.style.display = '';
      contentSection.innerHTML = '';

      enrichBtn.onclick = null;
      enrichBtn.addEventListener('pointerup', (e) => {
        e.preventDefault(); this._runEnrichment();
      }, { once: true });
      return;
    }

    emptySection.style.display = 'none';
    this._displayEnrichment(c.enrichment);
    contentSection.classList.add('visible');
  }

  _displayEnrichment(en) {
    const content = document.getElementById('enrichment-content');

    const confLabel = CONFIDENCE_LABELS[en.confidence] || en.confidence;
    const confClass = `confidence-${en.confidence}`;
    const mcapLabel = MARKET_CAP_LABELS[en.market_cap_bucket] || en.market_cap_bucket;
    const enrichedAt = this._formatDateTime(en.enriched_at);

    const risksHtml = (en.risks || []).map(r =>
      `<li>${this._esc(r)}</li>`
    ).join('');

    const catalystsHtml = (en.catalysts || []).map(c =>
      `<li>${this._esc(c)}</li>`
    ).join('');

    content.innerHTML = `
      <div class="enrichment-meta">
        <span class="badge ${confClass}">${confLabel}</span>
        ${en.market_cap_bucket ? `<span class="badge mcap-badge">${mcapLabel}</span>` : ''}
        ${en.sector ? `<span class="badge mcap-badge">${this._esc(en.sector)}</span>` : ''}
        ${en.region ? `<span class="badge mcap-badge">${this._esc(en.region)}</span>` : ''}
      </div>
      ${en.industry ? `<div class="text-muted" style="font-size:0.75rem;margin-bottom:10px;">${this._esc(en.industry)}</div>` : ''}
      ${en.thesis_short ? `<div class="enrichment-thesis-short">${this._esc(en.thesis_short)}</div>` : ''}
      ${en.thesis_long  ? `<div class="enrichment-thesis-long">${this._renderMarkdown(en.thesis_long)}</div>` : ''}
      <div class="enrichment-lists">
        ${risksHtml ? `
          <div>
            <div class="enrichment-list-title">Risiken</div>
            <ul class="enrichment-list risks">${risksHtml}</ul>
          </div>` : ''}
        ${catalystsHtml ? `
          <div>
            <div class="enrichment-list-title">Katalysatoren</div>
            <ul class="enrichment-list catalysts">${catalystsHtml}</ul>
          </div>` : ''}
      </div>
      <div class="enrichment-timestamp">Analysiert: ${enrichedAt} · Modell: ${this._esc(en.model || '—')}</div>
    `;
    content.classList.add('visible');
  }

  async _runEnrichment() {
    const apiKey = localStorage.getItem('claude_api_key') || '';
    const emptySection   = document.getElementById('enrichment-empty');
    const loadingSection = document.getElementById('enrichment-loading');
    const enrichBtn      = document.getElementById('enrich-btn');

    if (!apiKey) {
      this._showToast('Kein Claude API Key konfiguriert. Bitte in den Einstellungen eingeben.', 'error');
      return;
    }

    emptySection.style.display = 'none';
    loadingSection.classList.add('visible');
    enrichBtn.disabled = true;

    try {
      const enrichment = await enrichCandidate(this._candidate, apiKey);
      this._candidate.enrichment = enrichment;

      if (this._onStateChange) {
        await this._onStateChange(this._candidate.id, { enrichment });
      }

      loadingSection.classList.remove('visible');
      this._displayEnrichment(enrichment);
      this._showToast(`${this._candidate.symbol} erfolgreich angereichert`, 'success');
    } catch (err) {
      loadingSection.classList.remove('visible');
      emptySection.style.display = '';
      enrichBtn.disabled = false;
      // Re-attach click handler
      enrichBtn.addEventListener('pointerup', (e) => {
        e.preventDefault(); this._runEnrichment();
      }, { once: true });
      this._showToast(`Enrichment fehlgeschlagen: ${err.message}`, 'error');
    }
  }

  _renderActions(c) {
    const bar = document.getElementById('drawer-actions');
    bar.innerHTML = '';

    const state = c.workspace_state;

    // Dismiss button – show unless already dismissed
    if (state !== 'dismissed') {
      const btn = this._makeBtn('Ablehnen', 'btn btn-secondary btn-sm', '✗');
      btn.setAttribute('aria-label', `${c.symbol} ablehnen`);
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault(); this._changeState('dismissed');
      });
      bar.appendChild(btn);
    }

    // Promote button – show unless already promoted or exported
    if (state !== 'promoted' && state !== 'imported') {
      const btn = this._makeBtn('Promoten', 'btn btn-success btn-sm', '↑');
      btn.setAttribute('aria-label', `${c.symbol} promoten`);
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault(); this._changeState('promoted');
      });
      bar.appendChild(btn);
    }

    // Mark as reviewed
    if (state === 'new') {
      const btn = this._makeBtn('Als geprüft markieren', 'btn btn-secondary btn-sm', '✓');
      btn.setAttribute('aria-label', `${c.symbol} als geprüft markieren`);
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault(); this._changeState('reviewed');
      });
      bar.appendChild(btn);
    }

    // If all already done, show info
    if (state === 'dismissed') {
      const span = document.createElement('span');
      span.className = 'text-muted';
      span.style.fontSize = '0.8rem';
      span.textContent = 'Kandidat wurde abgelehnt.';
      bar.appendChild(span);
    }
    if (state === 'promoted' || state === 'imported') {
      const span = document.createElement('span');
      span.className = 'text-muted';
      span.style.fontSize = '0.8rem';
      span.textContent = 'Kandidat befindet sich im Export.';
      bar.appendChild(span);
    }
  }

  _makeBtn(label, classes, icon) {
    const btn = document.createElement('button');
    btn.className = classes;
    btn.innerHTML = `${icon} ${label}`;
    return btn;
  }

  async _changeState(newState) {
    if (!this._onStateChange || !this._candidate) return;
    const oldState = this._candidate.workspace_state;
    this._candidate.workspace_state = newState;
    this._renderActions(this._candidate);
    document.getElementById('drawer-state-badge').innerHTML =
      this._stateBadgeHTML(newState);
    try {
      await this._onStateChange(this._candidate.id, { workspace_state: newState });
    } catch (err) {
      // Revert on failure
      this._candidate.workspace_state = oldState;
      this._renderActions(this._candidate);
      this._showToast(`Aktion fehlgeschlagen: ${err.message}`, 'error');
    }
  }

  _saveNotes(value) {
    if (!this._onStateChange || !this._candidate) return;
    clearTimeout(this._notesSaveTimer);
    this._notesSaveTimer = setTimeout(async () => {
      this._candidate.notes = value;
      try {
        await this._onStateChange(this._candidate.id, { notes: value });
        const hint = document.getElementById('notes-saved-hint');
        if (hint) {
          hint.classList.add('show');
          setTimeout(() => hint.classList.remove('show'), 1500);
        }
      } catch (_) { /* silent */ }
    }, 800);
  }

  // --- Helpers ---

  _stateBadgeHTML(state) {
    return `<span class="badge state-badge state-${state}">${STATE_LABELS[state] || state}</span>`;
  }

  _formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return iso; }
  }

  _formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
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
    for (let i = 0; i < adapter.length; i++) hash = (hash * 31 + adapter.charCodeAt(i)) & 0xffffffff;
    const [fg, bg] = colors[Math.abs(hash) % colors.length].split(',');
    return `color:${fg};background:${bg};border-color:${fg}40`;
  }

  /**
   * Very minimal markdown → HTML (headings, bold, lists).
   * Not a full parser – safe for controlled AI output.
   */
  _renderMarkdown(md) {
    if (!md) return '';
    let html = this._esc(md);
    // ## Headings
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    // **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/gs, (m) => `<ol>${m}</ol>`);
    // Bullet lists
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    // Double newline → paragraph break
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newlines
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _showToast(message, type = 'info') {
    // Delegate to global toast function if available
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    }
  }
}
