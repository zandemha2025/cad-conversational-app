const PROXY_KEY = "scalecad-zoo-proxy-2024";
const ZOO_BASE = "https://api.zoo.dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Proxy-Key",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Shared secret check
    const proxyKey = request.headers.get("X-Proxy-Key");
    if (proxyKey !== PROXY_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Allowlist: only the two Zoo.dev endpoints we need
    const allowed =
      (request.method === "POST" && path === "/ai/text-to-cad/glb") ||
      (request.method === "GET" && /^\/user\/text-to-cad\/[^/]+$/.test(path));

    if (!allowed) {
      return new Response("Not Found", { status: 404 });
    }

    // Build upstream URL, preserving query params
    const upstream = new URL(ZOO_BASE + path);
    url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

    // Forward headers, stripping hop-by-hop and proxy-specific ones
    const forwardHeaders = new Headers();
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      if (lower === "host" || lower === "x-proxy-key" || lower === "cf-connecting-ip") continue;
      forwardHeaders.set(k, v);
    }

    const upstreamResp = await fetch(upstream.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: request.method === "POST" ? request.body : undefined,
    });

    // Return response with CORS headers added
    const respHeaders = new Headers(upstreamResp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  },
};
