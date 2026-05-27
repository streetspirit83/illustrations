/**
 * Schema validators for Discovery Workspace blobs and candidates.
 */

const VALID_WORKSPACE_STATES = new Set(['new', 'reviewed', 'promoted', 'dismissed', 'imported']);
const VALID_BLOB_TYPES        = new Set(['inbox', 'archive', 'export']);

/**
 * Validates a single candidate object.
 *
 * @param {object} candidate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCandidate(candidate) {
  const errors = [];

  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, errors: ['candidate must be a non-null object'] };
  }

  // Required top-level fields
  const requiredFields = [
    'id',
    'symbol',
    'exchange',
    'yahoo_symbol',
    'name',
    'sources',
    'links',
    'workspace_state',
    'first_discovered_at',
    'last_updated_at',
  ];

  for (const field of requiredFields) {
    if (candidate[field] === undefined || candidate[field] === null || candidate[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }

  // workspace_state enum
  if (candidate.workspace_state !== undefined && !VALID_WORKSPACE_STATES.has(candidate.workspace_state)) {
    errors.push(
      `workspace_state must be one of: ${[...VALID_WORKSPACE_STATES].join(', ')}; got "${candidate.workspace_state}"`
    );
  }

  // sources must be a non-empty array
  if (!Array.isArray(candidate.sources)) {
    errors.push('sources must be an array');
  } else if (candidate.sources.length === 0) {
    errors.push('sources must not be empty');
  } else {
    candidate.sources.forEach((src, i) => {
      if (!src || typeof src !== 'object') {
        errors.push(`sources[${i}] must be an object`);
        return;
      }
      for (const f of ['adapter', 'discovered_at', 'signal_type']) {
        if (!src[f]) {
          errors.push(`sources[${i}] missing required field: ${f}`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a blob (file stored by StorageClient).
 *
 * @param {object} blob
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBlob(blob) {
  const errors = [];

  if (!blob || typeof blob !== 'object') {
    return { valid: false, errors: ['blob must be a non-null object'] };
  }

  // Required top-level fields
  for (const field of ['schema_version', 'blob_type', 'updated_at', 'candidates']) {
    if (blob[field] === undefined || blob[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // blob_type enum
  if (blob.blob_type !== undefined && !VALID_BLOB_TYPES.has(blob.blob_type)) {
    errors.push(
      `blob_type must be one of: ${[...VALID_BLOB_TYPES].join(', ')}; got "${blob.blob_type}"`
    );
  }

  // candidates must be an array
  if (blob.candidates !== undefined && !Array.isArray(blob.candidates)) {
    errors.push('candidates must be an array');
  }

  return { valid: errors.length === 0, errors };
}
