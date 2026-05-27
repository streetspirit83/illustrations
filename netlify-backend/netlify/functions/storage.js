import { getStore } from "@netlify/blobs";

const BLOB_KEY = "data";

const BLOB_TYPES = {
  "discovery-inbox": "inbox",
  "discovery-archive": "archive",
  "discovery-export": "export",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-discovery-secret",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function emptyBlob(blobName) {
  return {
    schema_version: "discovery-1.0",
    blob_type: BLOB_TYPES[blobName] ?? blobName,
    updated_at: new Date().toISOString(),
    candidates: [],
  };
}

async function readBlob(store, blobName) {
  const data = await store.get(BLOB_KEY, { type: "json" });
  return data ?? emptyBlob(blobName);
}

async function writeBlob(store, data) {
  data.updated_at = new Date().toISOString();
  await store.set(BLOB_KEY, JSON.stringify(data));
}

function candidateKey(candidate) {
  return `${(candidate.symbol ?? "").toLowerCase()}|${(candidate.exchange ?? "").toLowerCase()}`;
}

export default async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  // Auth check
  const secret = event.headers["x-discovery-secret"];
  if (!secret || secret !== process.env.DISCOVERY_SECRET) {
    return jsonResponse(401, { ok: false, error: "Unauthorized" });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
  }

  const { op } = body;

  try {
    switch (op) {
      case "read": {
        const { blob_name } = body;
        if (!blob_name) return jsonResponse(400, { ok: false, error: "blob_name required" });

        const store = getStore(blob_name);
        const data = await readBlob(store, blob_name);
        return jsonResponse(200, { ok: true, data });
      }

      case "write": {
        const { blob_name, data } = body;
        if (!blob_name) return jsonResponse(400, { ok: false, error: "blob_name required" });
        if (data === undefined) return jsonResponse(400, { ok: false, error: "data required" });

        const store = getStore(blob_name);
        await writeBlob(store, data);
        return jsonResponse(200, { ok: true });
      }

      case "append_candidate": {
        const { candidate } = body;
        if (!candidate) return jsonResponse(400, { ok: false, error: "candidate required" });

        const key = candidateKey(candidate);

        // 1. Check inbox for existing entry (symbol+exchange match)
        const inboxStore = getStore("discovery-inbox");
        const inbox = await readBlob(inboxStore, "discovery-inbox");

        const existingInboxIdx = inbox.candidates.findIndex(
          (c) => candidateKey(c) === key
        );

        if (existingInboxIdx !== -1) {
          // Merge: add source into sources array if not already present
          const existing = inbox.candidates[existingInboxIdx];
          existing.sources = existing.sources ?? [];

          const incomingSources = candidate.sources ?? [];
          for (const src of incomingSources) {
            const alreadyPresent = existing.sources.some(
              (s) => JSON.stringify(s) === JSON.stringify(src)
            );
            if (!alreadyPresent) {
              existing.sources.push(src);
            }
          }
          existing.last_updated_at = new Date().toISOString();
          inbox.candidates[existingInboxIdx] = existing;
          await writeBlob(inboxStore, inbox);
          return jsonResponse(200, { ok: true, action: "merged" });
        }

        // 2. Check archive and export for symbol+exchange
        const archiveStore = getStore("discovery-archive");
        const exportStore = getStore("discovery-export");

        const [archive, exportBlob] = await Promise.all([
          readBlob(archiveStore, "discovery-archive"),
          readBlob(exportStore, "discovery-export"),
        ]);

        const inArchive = archive.candidates.some((c) => candidateKey(c) === key);
        const inExport = exportBlob.candidates.some((c) => candidateKey(c) === key);

        if (inArchive || inExport) {
          return jsonResponse(200, { ok: true, action: "skipped_in_archive" });
        }

        // 3. Insert new candidate into inbox
        candidate.last_updated_at = candidate.last_updated_at ?? new Date().toISOString();
        inbox.candidates.push(candidate);
        await writeBlob(inboxStore, inbox);
        return jsonResponse(200, { ok: true, action: "inserted" });
      }

      case "update_candidate": {
        const { blob_name, candidate_id, patch } = body;
        if (!blob_name) return jsonResponse(400, { ok: false, error: "blob_name required" });
        if (!candidate_id) return jsonResponse(400, { ok: false, error: "candidate_id required" });
        if (!patch) return jsonResponse(400, { ok: false, error: "patch required" });

        const store = getStore(blob_name);
        const blob = await readBlob(store, blob_name);

        const idx = blob.candidates.findIndex((c) => c.id === candidate_id);
        if (idx === -1) {
          return jsonResponse(404, { ok: false, error: "Candidate not found" });
        }

        blob.candidates[idx] = { ...blob.candidates[idx], ...patch, last_updated_at: new Date().toISOString() };
        await writeBlob(store, blob);
        return jsonResponse(200, { ok: true });
      }

      case "move_candidate": {
        const { from_blob, to_blob, candidate_id } = body;
        if (!from_blob) return jsonResponse(400, { ok: false, error: "from_blob required" });
        if (!to_blob) return jsonResponse(400, { ok: false, error: "to_blob required" });
        if (!candidate_id) return jsonResponse(400, { ok: false, error: "candidate_id required" });

        const fromStore = getStore(from_blob);
        const toStore = getStore(to_blob);

        const [fromBlob, toBlob] = await Promise.all([
          readBlob(fromStore, from_blob),
          readBlob(toStore, to_blob),
        ]);

        const idx = fromBlob.candidates.findIndex((c) => c.id === candidate_id);
        if (idx === -1) {
          return jsonResponse(404, { ok: false, error: "Candidate not found in source blob" });
        }

        const [candidate] = fromBlob.candidates.splice(idx, 1);
        candidate.last_updated_at = new Date().toISOString();
        toBlob.candidates.push(candidate);

        await Promise.all([
          writeBlob(fromStore, fromBlob),
          writeBlob(toStore, toBlob),
        ]);

        return jsonResponse(200, { ok: true });
      }

      default:
        return jsonResponse(400, { ok: false, error: `Unknown op: ${op}` });
    }
  } catch (err) {
    console.error("storage function error:", err);
    return jsonResponse(500, { ok: false, error: err.message ?? "Internal server error" });
  }
}
