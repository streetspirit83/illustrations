/**
 * SettingsModal – manages backend & API key configuration.
 * Persists values to localStorage.
 */
export class SettingsModal {
  constructor() {
    this._backdrop = document.getElementById('settings-modal-backdrop');
    this._form     = document.getElementById('settings-form');
    this._onSave   = null;
    this._bindEvents();
  }

  /** @param {() => void} [onSave] Called after settings are saved. */
  show(onSave) {
    this._onSave = onSave || null;
    this._loadValues();
    this._backdrop.classList.add('open');
    this._backdrop.querySelector('.modal').setAttribute('aria-modal', 'true');
    setTimeout(() => {
      const first = this._form.querySelector('input');
      if (first) first.focus();
    }, 50);
  }

  hide() {
    this._backdrop.classList.remove('open');
  }

  /** Returns true if no backend URL is set (first-visit scenario). */
  isFirstVisit() {
    return !localStorage.getItem('discovery_backend_url');
  }

  _loadValues() {
    this._field('settings-backend-url').value  = localStorage.getItem('discovery_backend_url') || '';
    this._field('settings-secret').value        = localStorage.getItem('discovery_secret')      || '';
    this._field('settings-claude-key').value    = localStorage.getItem('claude_api_key')        || '';
    this._field('settings-github-pat').value    = localStorage.getItem('github_pat')            || '';
    // Clear any previous errors
    this._backdrop.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
  }

  _field(id) { return document.getElementById(id); }

  _bindEvents() {
    // Close button
    this._backdrop.querySelector('#settings-close-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this.hide();
    });

    // Cancel button
    this._backdrop.querySelector('#settings-cancel-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this.hide();
    });

    // Save button
    this._backdrop.querySelector('#settings-save-btn').addEventListener('pointerup', (e) => {
      e.preventDefault(); this._save();
    });

    // Backdrop click to close
    this._backdrop.addEventListener('pointerup', (e) => {
      if (e.target === this._backdrop) this.hide();
    });

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._backdrop.classList.contains('open')) {
        this.hide();
      }
    });

    // Test connection button
    const testBtn = document.getElementById('settings-test-btn');
    if (testBtn) {
      testBtn.addEventListener('pointerup', (e) => {
        e.preventDefault(); this._testConnection();
      });
    }
  }

  _validate() {
    let valid = true;
    const urlField    = this._field('settings-backend-url');
    const urlError    = document.getElementById('settings-url-error');

    urlError.classList.remove('visible');

    const url = urlField.value.trim();
    if (url && !this._isValidUrl(url)) {
      urlError.classList.add('visible');
      urlError.textContent = 'Ungültige URL. Beispiel: https://my-backend.example.com';
      valid = false;
    }

    return valid;
  }

  _isValidUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  _save() {
    if (!this._validate()) return;

    const url    = this._field('settings-backend-url').value.trim();
    const secret = this._field('settings-secret').value.trim();
    const apiKey = this._field('settings-claude-key').value.trim();
    const pat    = this._field('settings-github-pat').value.trim();

    if (url)    localStorage.setItem('discovery_backend_url', url);
    else        localStorage.removeItem('discovery_backend_url');

    if (secret) localStorage.setItem('discovery_secret', secret);
    else        localStorage.removeItem('discovery_secret');

    if (apiKey) localStorage.setItem('claude_api_key', apiKey);
    else        localStorage.removeItem('claude_api_key');

    if (pat)    localStorage.setItem('github_pat', pat);
    else        localStorage.removeItem('github_pat');

    this.hide();
    if (this._onSave) this._onSave();
  }

  async _testConnection() {
    const url    = this._field('settings-backend-url').value.trim();
    const secret = this._field('settings-secret').value.trim();
    const testBtn = document.getElementById('settings-test-btn');
    const resultEl = document.getElementById('settings-test-result');

    if (!url) {
      resultEl.textContent = 'Bitte zuerst eine Backend-URL eingeben.';
      resultEl.className = 'form-error visible';
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Teste...';
    resultEl.className = 'form-hint';
    resultEl.textContent = '';

    try {
      const res = await fetch(`${url}/api/storage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-discovery-secret': secret
        },
        body: JSON.stringify({ action: 'ping' })
      });
      if (res.ok || res.status === 400) {
        resultEl.textContent = '✓ Verbindung erfolgreich';
        resultEl.className = 'form-hint text-success';
      } else {
        resultEl.textContent = `Fehler ${res.status}: ${res.statusText}`;
        resultEl.className = 'form-error visible';
      }
    } catch (err) {
      resultEl.textContent = `Verbindung fehlgeschlagen: ${err.message}`;
      resultEl.className = 'form-error visible';
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Verbindung testen';
    }
  }
}
