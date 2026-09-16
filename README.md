# edge-relay

## Description

A streaming reverse proxy for Vercel's Node.js runtime that forwards all incoming requests to a configurable upstream and streams the response back without buffering. Designed for request-scoped proxying where each invocation completes under the execution timeout.

## Configuration

**Required environment variable:** `UPSTREAM_BASE`

Set it for both Production and Preview environments in the Vercel dashboard, or via:

```
vercel env add UPSTREAM_BASE
```

**Example value:**
```
https://upstream.example.com
```

The upstream path is always `/vless` followed by the original query string. For example, a request to `/path?key=value` will be proxied to `https://upstream.example.com/vless?key=value`.

## Deploy

**Via CLI:**
```
vercel --prod
```

**Via Vercel Dashboard:**
- Framework Preset: `Other`
- Root Directory: `./`
- Build Command: (leave empty)
- Output Directory: (leave empty)
- Node.js Version: `20.x` or `24.x`

## Platform Limits

**Execution timeout.** Vercel's Node.js functions under Fluid Compute (available on all plans including Hobby) have a default and maximum execution duration of 300 seconds. `maxDuration = 300` in `api/relay.js` sets the handler to the platform maximum. Any response still streaming at the 300-second mark is terminated mid-stream by the platform.

**Billing model.** Vercel bills Node functions on wall-clock GB-hours — memory allocated × duration the function instance is alive, regardless of how much CPU the code actually uses. An idle stream waiting on I/O still consumes GB-hours at the function's configured memory. The Hobby tier includes 100 GB-hours per month. This is not a "CPU-hour" budget; idle time is not free.

**WebSocket upgrades.** Vercel Functions cannot carry WebSocket upgrades on any plan. The function handler never receives the raw socket, so the upgrade handshake cannot be completed. This relay handles HTTP request/response streaming only.

**Edge runtime.** Not used here, but for reference: the Edge runtime has a 25–30 second timeout on Hobby. It is also unsuitable for persistent streams, and cannot stream request bodies the way Node can.

**Verdict.** This relay works for request-scoped proxying where each invocation completes under 300 seconds. It does not work for persistent tunnels.

## Gotchas

- The host header must be rewritten to the upstream hostname or the upstream returns 404. The relay does this.
- Do not forward `content-length` or `content-encoding` — fetch re-frames and re-encodes the body.
- Do not forward `connection` / `upgrade` — hop-by-hop, and Vercel Functions cannot carry WebSocket upgrades regardless.
- The runtime must be `nodejs`, not `edge`.
- `req.url` after a Vercel rewrite is not guaranteed to match the original request URL. The relay extracts the query string by finding the first `?` rather than assuming a path prefix. Do not "fix" this to use a path-based extraction.
- `duplex: "half"` is required when passing a stream as body to fetch. Removing it causes a runtime error on every non-GET request.
- `maxDuration = 300` is the platform ceiling. Vercel enforces this on all plans under Fluid Compute.
