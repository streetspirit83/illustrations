/**
 * Adapter runner for GitHub Actions.
 *
 * Usage:
 *   node adapters/_run.js <adapter-name>
 *
 * Example:
 *   node adapters/_run.js openinsider
 *
 * Required env vars:
 *   DISCOVERY_BACKEND_URL – Netlify site URL
 *   DISCOVERY_SECRET      – shared secret for /api/storage
 */

import { StorageClient } from './_shared/storage-client.js';

const INBOX_BLOB = 'discovery-inbox';

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

function logLine(obj) {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), ...obj }) + '\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const [, , adapterName] = process.argv;

  if (!adapterName) {
    process.stderr.write('Usage: node adapters/_run.js <adapter-name>\n');
    process.exit(1);
  }

  // Load adapter module
  let adapterModule;
  try {
    adapterModule = await import(`./${adapterName}.js`);
  } catch (err) {
    process.stderr.write(`Failed to load adapter "${adapterName}": ${err.message}\n`);
    process.exit(1);
  }

  const { meta, fetchCandidates } = adapterModule;

  if (typeof fetchCandidates !== 'function') {
    process.stderr.write(`Adapter "${adapterName}" must export fetchCandidates()\n`);
    process.exit(1);
  }

  logLine({ adapter: adapterName, event: 'start' });

  // Build storage client
  const backendUrl = process.env.DISCOVERY_BACKEND_URL;
  const secret     = process.env.DISCOVERY_SECRET;

  if (!backendUrl || !secret) {
    process.stderr.write(
      'DISCOVERY_BACKEND_URL and DISCOVERY_SECRET environment variables are required\n'
    );
    process.exit(1);
  }

  const storageClient = new StorageClient({ baseUrl: backendUrl, secret });

  // Fetch candidates
  let candidates;
  try {
    candidates = await fetchCandidates(meta?.default_filters ?? {});
    logLine({ adapter: adapterName, event: 'fetched', count: candidates.length });
  } catch (err) {
    logLine({ adapter: adapterName, event: 'fetch_error', error: err.message });
    process.exit(1);
  }

  // Persist each candidate
  let successCount = 0;
  let errorCount   = 0;

  for (const candidate of candidates) {
    try {
      const result = await storageClient.appendCandidate(INBOX_BLOB, candidate);
      logLine({
        adapter:  adapterName,
        action:   result.action ?? 'appended',
        symbol:   candidate.symbol,
        exchange: candidate.exchange,
        result:   'ok',
      });
      successCount++;
    } catch (err) {
      logLine({
        adapter:  adapterName,
        action:   'append_failed',
        symbol:   candidate.symbol,
        exchange: candidate.exchange,
        result:   'error',
        error:    err.message,
      });
      errorCount++;
    }
  }

  logLine({
    adapter:  adapterName,
    event:    'done',
    success:  successCount,
    errors:   errorCount,
  });

  process.exit(errorCount > 0 && successCount === 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Unhandled error: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
