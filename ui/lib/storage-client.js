/**
 * StorageClient – browser fetch variant.
 * All mutations POST to ${baseUrl}/api/storage with x-discovery-secret header.
 */
export class StorageClient {
  /**
   * @param {{ baseUrl?: string, secret?: string }} [opts]
   */
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl
      || localStorage.getItem('discovery_backend_url')
      || '';
    this.secret = opts.secret
      || localStorage.getItem('discovery_secret')
      || '';
  }

  /** Returns true when no backend URL is configured – mutations are no-ops. */
  isMockMode() {
    return !this.baseUrl || this.baseUrl.trim() === '';
  }

  /** Reload credentials from localStorage (call after settings are saved). */
  refresh() {
    this.baseUrl = localStorage.getItem('discovery_backend_url') || '';
    this.secret = localStorage.getItem('discovery_secret') || '';
  }

  /** @private */
  async _post(payload) {
    if (this.isMockMode()) {
      return { ok: true, mock: true };
    }
    const res = await fetch(`${this.baseUrl}/api/storage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-discovery-secret': this.secret
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Storage API error ${res.status}: ${text}`);
    }
    return res.json();
  }

  /**
   * Read a named blob from the backend.
   * In mock mode always returns null (caller falls back to local mock data).
   * @param {string} name  e.g. 'discovery-inbox'
   * @returns {Promise<object|null>}
   */
  async readBlob(name) {
    if (this.isMockMode()) return null;
    return this._post({ action: 'readBlob', name });
  }

  /**
   * Overwrite a named blob entirely.
   * @param {string} name
   * @param {object} data
   * @returns {Promise<{ ok: boolean }>}
   */
  async writeBlob(name, data) {
    return this._post({ action: 'writeBlob', name, data });
  }

  /**
   * Append a candidate to a blob, or update in-place if id already exists.
   * @param {string} blobName
   * @param {object} candidate
   * @returns {Promise<{ ok: boolean, action: 'appended'|'updated' }>}
   */
  async appendCandidate(blobName, candidate) {
    return this._post({ action: 'appendCandidate', blobName, candidate });
  }

  /**
   * Apply a partial patch to an existing candidate in a blob.
   * @param {string} blobName
   * @param {string} id
   * @param {object} patch   Plain object with fields to merge.
   * @returns {Promise<{ ok: boolean }>}
   */
  async updateCandidate(blobName, id, patch) {
    return this._post({ action: 'updateCandidate', blobName, id, patch });
  }

  /**
   * Move a candidate from one blob to another.
   * @param {string} id
   * @param {string} fromBlob
   * @param {string} toBlob
   * @returns {Promise<{ ok: boolean }>}
   */
  async moveCandidate(id, fromBlob, toBlob) {
    return this._post({ action: 'moveCandidate', id, fromBlob, toBlob });
  }
}
