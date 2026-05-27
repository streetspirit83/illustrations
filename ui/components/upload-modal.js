/**
 * UploadModal – handles file upload and JSON blob validation.
 */
import { SCHEMA_VERSION } from '../lib/schema.js';

export class UploadModal {
  constructor() {
    this._backdrop  = document.getElementById('upload-modal-backdrop');
    this._onSuccess = null;
    this._parsedBlob = null;
    this._bindEvents();
  }

  /**
   * @param {(blob: object) => void} onSuccess  Called with parsed blob on valid upload
   */
  show(onSuccess) {
    this._onSuccess = onSuccess;
    this._reset();
    this._backdrop.classList.add('open');
    this._backdrop.querySelector('.modal').setAttribute('aria-modal', 'true');
  }

  hide() {
    this._backdrop.classList.remove('open');
    this._reset();
  }

  _reset() {
    this._parsedBlob = null;
    const fileInput = document.getElementById('upload-file-input');
    if (fileInput) fileInput.value = '';
    const result = document.getElementById('upload-result');
    if (result) { result.className = 'upload-result'; result.textContent = ''; }
    const confirmBtn = document.getElementById('upload-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) uploadArea.classList.remove('dragover');
    const areaText = document.getElementById('upload-area-filename');
    if (areaText) areaText.textContent = 'JSON-Datei hier ablegen oder klicken';
  }

  _bindEvents() {
    // Close button
    this._backdrop.querySelector('#upload-close-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this.hide();
    });

    // Cancel button
    this._backdrop.querySelector('#upload-cancel-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this.hide();
    });

    // Confirm button
    this._backdrop.querySelector('#upload-confirm-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._confirm();
    });

    // Backdrop click
    this._backdrop.addEventListener('pointerup', (e) => {
      if (e.target === this._backdrop) this.hide();
    });

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._backdrop.classList.contains('open')) {
        this.hide();
      }
    });

    // Upload area click
    const uploadArea = document.getElementById('upload-area');
    const fileInput  = document.getElementById('upload-file-input');

    uploadArea.addEventListener('pointerup', (e) => {
      e.preventDefault();
      fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this._processFile(file);
    });

    // Drag & drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this._processFile(file);
    });
  }

  _processFile(file) {
    const resultEl = document.getElementById('upload-result');
    const filenameEl = document.getElementById('upload-area-filename');

    if (!file.name.endsWith('.json')) {
      this._showResult('error', `Ungültiger Dateityp: ${file.name}. Nur .json erlaubt.`);
      return;
    }

    filenameEl.textContent = file.name;
    resultEl.className = 'upload-result';
    resultEl.textContent = 'Lese Datei...';
    resultEl.classList.add('visible');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const blob = JSON.parse(e.target.result);
        const validation = this._validateBlob(blob);
        if (!validation.ok) {
          this._showResult('error', `Validierungsfehler: ${validation.errors.join('; ')}`);
          document.getElementById('upload-confirm-btn').disabled = true;
        } else {
          this._parsedBlob = blob;
          const count = blob.candidates.length;
          this._showResult('success',
            `✓ Gültig — ${count} Kandidat${count !== 1 ? 'en' : ''} gefunden ` +
            `(Schema: ${blob.schema_version}, Typ: ${blob.blob_type})`
          );
          document.getElementById('upload-confirm-btn').disabled = false;
        }
      } catch (err) {
        this._showResult('error', `JSON-Parsing-Fehler: ${err.message}`);
        document.getElementById('upload-confirm-btn').disabled = true;
      }
    };
    reader.onerror = () => {
      this._showResult('error', 'Fehler beim Lesen der Datei.');
    };
    reader.readAsText(file);
  }

  _validateBlob(blob) {
    const errors = [];

    if (!blob || typeof blob !== 'object') {
      errors.push('Kein gültiges JSON-Objekt');
      return { ok: false, errors };
    }

    if (blob.schema_version !== SCHEMA_VERSION) {
      errors.push(
        `Ungültige schema_version: "${blob.schema_version}" (erwartet: "${SCHEMA_VERSION}")`
      );
    }

    if (!Array.isArray(blob.candidates)) {
      errors.push('Fehlendes oder ungültiges "candidates" Array');
    } else if (blob.candidates.length === 0) {
      errors.push('candidates Array ist leer');
    } else {
      // Spot-check first few candidates
      const toCheck = blob.candidates.slice(0, 3);
      toCheck.forEach((c, i) => {
        if (!c.id)       errors.push(`candidates[${i}]: fehlendes "id"`);
        if (!c.symbol)   errors.push(`candidates[${i}]: fehlendes "symbol"`);
        if (!c.exchange) errors.push(`candidates[${i}]: fehlendes "exchange"`);
        if (!Array.isArray(c.sources)) {
          errors.push(`candidates[${i}]: "sources" muss ein Array sein`);
        }
      });
    }

    return { ok: errors.length === 0, errors };
  }

  _showResult(type, message) {
    const el = document.getElementById('upload-result');
    el.textContent = message;
    el.className = `upload-result visible ${type}`;
  }

  _confirm() {
    if (!this._parsedBlob) return;
    const blob = this._parsedBlob;
    this.hide();
    if (this._onSuccess) this._onSuccess(blob);
  }
}
