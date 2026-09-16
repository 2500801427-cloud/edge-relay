export const config = { runtime: "nodejs" };
export const maxDuration = 300;

export default async (req, res) => {
  // Read and validate UPSTREAM_BASE
  const UPSTREAM_BASE = process.env.UPSTREAM_BASE;
  
  if (!UPSTREAM_BASE || UPSTREAM_BASE.trim() === "") {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "UPSTREAM_BASE unset" }));
    return;
  }

  // Normalize base by stripping all trailing slashes
  const base = UPSTREAM_BASE.replace(/\/+$/, "");

  // Extract query string from req.url by slicing at the first "?".
  // Do NOT assume req.url contains the original path — Vercel documents
  // that after a rewrite, req.url is not guaranteed to match the original
  // request URL. Finding the first "?" is the only stable approach.
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  // Trailing slash after "vless" is required by Xray's XHTTP path matching.
  // Xray normalizes all configured paths to end with "/" and validates incoming
  // requests using HasPrefix(requestPath, configPath). A request to "/vless" does
  // not match the configured "/vless/" — do not remove this slash.
  const upstream = `${base}/vless/${qs}`;

  // Get the upstream hostname
  const targetHost = new URL(base).host;

  // Define case-insensitive strip set for headers that must not be forwarded
  const stripSet = new Set([
    "host",
    "content-length",
    "content-encoding",
    "transfer-encoding",
    "connection",
    "upgrade",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailer",
    "proxy-authenticate",
    "proxy-authorization",
  ]);

  // Build outgoing header object, skipping anything in the strip set
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!stripSet.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }

  // Rewrite host header to upstream hostname (mandatory)
  headers["host"] = targetHost;

  try {
    // Forward the request to upstream
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: "half",
      redirect: "manual",
    });

    // Set response status code
    res.statusCode = upstreamRes.status;

    // Copy upstream headers across, applying the same strip set
    for (const [key, value] of upstreamRes.headers.entries()) {
      if (!stripSet.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // Add tracing marker
    res.setHeader("x-relay", "edge");

    // Stream the body without buffering
    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }

    res.end();
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "relay failed", detail: String(err) }));
  }
};
