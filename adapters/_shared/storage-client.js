/**
 * StorageClient – Node.js variant for adapter scripts and GitHub Actions.
 *
 * All requests go through the Netlify serverless function at /api/storage,
 * authenticated with the x-discovery-secret header.
 */

export class StorageClient {
  /**
   * @param {{ baseUrl: string, secret: string }} opts
   *   baseUrl – Netlify site URL, e.g. "https://my-site.netlify.app"
   *   secret  – value of the DISCOVERY_SECRET environment variable
   */
  constructor({ baseUrl, secret }) {
    if (!baseUrl) throw new Error('StorageClient: baseUrl is required');
    if (!secret)  throw new Error('StorageClient: secret is required');

    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._secret  = secret;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Read a named blob from storage.
   * @param {string} name
   * @returns {Promise<object>} Parsed blob JSON
   */
  async readBlob(name) {
    return this._request({ action: 'readBlob', name });
  }

  /**
   * Write (overwrite) a named blob.
   * @param {string} name
   * @param {object} data
   * @returns {Promise<{ ok: boolean }>}
   */
  async writeBlob(name, data) {
    return this._request({ action: 'writeBlob', name, data });
  }

  /**
   * Append a candidate to an existing blob.
   * The server merges by id (upsert) and returns the action taken.
   * @param {string}  blobName
   * @param {object}  candidate
   * @returns {Promise<{ ok: boolean, action: "created" | "updated" }>}
   */
  async appendCandidate(blobName, candidate) {
    return this._request({ action: 'appendCandidate', name: blobName, candidate });
  }

  /**
   * Patch fields on an existing candidate.
   * @param {string} blobName
   * @param {string} id       – candidate id
   * @param {object} patch    – partial candidate fields to merge
   * @returns {Promise<{ ok: boolean }>}
   */
  async updateCandidate(blobName, id, patch) {
    return this._request({ action: 'updateCandidate', name: blobName, id, patch });
  }

  /**
   * Move a candidate from one blob to another.
   * @param {string} id
   * @param {string} fromBlob
   * @param {string} toBlob
   * @returns {Promise<{ ok: boolean }>}
   */
  async moveCandidate(id, fromBlob, toBlob) {
    return this._request({ action: 'moveCandidate', id, fromBlob, toBlob });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * @param {object} body
   * @returns {Promise<object>}
   */
  async _request(body) {
    const url = `${this._baseUrl}/api/storage`;

    let response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'x-discovery-secret': this._secret,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`StorageClient: network error on action "${body.action}": ${err.message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `StorageClient: HTTP ${response.status} on action "${body.action}": ${text}`
      );
    }

    let result;
    try {
      result = await response.json();
    } catch (err) {
      throw new Error(`StorageClient: invalid JSON response on action "${body.action}"`);
    }

    if (result.ok === false) {
      throw new Error(
        `StorageClient: action "${body.action}" returned ok=false: ${result.error ?? JSON.stringify(result)}`
      );
    }

    return result;
  }
}
