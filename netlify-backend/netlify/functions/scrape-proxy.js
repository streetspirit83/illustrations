const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-discovery-secret",
};

const URL_ALLOWLIST = [
  /openinsider\.com/,
  /boerse-frankfurt\.de/,
  /ishares\.com/,
  /etf\.com/,
  /finance\.yahoo\.com/,
];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    return URL_ALLOWLIST.some((pattern) => pattern.test(parsed.hostname));
  } catch {
    return false;
  }
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

  const { url, method = "GET", headers: requestHeaders = {} } = body;

  if (!url) {
    return jsonResponse(400, { ok: false, error: "url required" });
  }

  if (!isAllowedUrl(url)) {
    return jsonResponse(403, { ok: false, error: "URL not in allowlist" });
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = await response.text();

    return jsonResponse(200, {
      ok: true,
      status: response.status,
      body: responseBody,
      content_type: contentType,
    });
  } catch (err) {
    console.error("scrape-proxy fetch error:", err);
    return jsonResponse(502, { ok: false, error: err.message ?? "Fetch failed" });
  }
}
