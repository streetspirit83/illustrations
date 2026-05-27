# Discovery Workspace – Claude Code Hinweise

## Architektur-Überblick

Drei Komponenten:
- **ui/** – GitHub Pages, Vanilla JS, kein Build-Step
- **adapters/** – Node.js 20 ES Modules, laufen in GitHub Actions
- **netlify-backend/** – Netlify Functions + Blobs (separater Deploy)

## Kernregeln

- **AI-Enrichment ist optional** – Promotion entkoppelt vom Enrichment. Kandidaten können promoted werden ohne Enrichment. `enrichment: null` ist gültiger Zustand im export-Blob.
- **Mock-first:** ui/mock/inbox.json für UI-Iteration ohne echtes Backend
- **Surgical edits only:** Nur den angefragten Teil ändern, kein opportunistic Refactoring
- **Kein TypeScript, kein React** in der UI (Hard Rule)
- **Schema-Version:** Bei Schema-Änderungen Migration-Script schreiben + `schema_version` hochzählen

## Dedup-Key

`symbol + exchange` (case-insensitive). Keine Auferstehung aus archive/export.

## State-Machine

```
new → reviewed → promoted → imported → (archive)
new/reviewed → dismissed → (archive)
```

Promote verschiebt in export-Blob. Enrichment ist ein separater Schritt.

## Storage

Alle Blob-Mutationen laufen durch die Netlify `storage.js` Function.
Dedup-Logik sitzt in der Function, nicht im Client.

## Adapter-Interface

```js
export const meta = { name, description, region, signal_types, schedule, default_filters }
export async function fetchCandidates(config) { return candidates[] }
```

## Timestamps

Alle Timestamps ISO 8601 UTC. IDs immer UUID v4.
