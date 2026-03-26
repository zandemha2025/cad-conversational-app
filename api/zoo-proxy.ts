// api/zoo-proxy.ts - Vercel Edge function proxying requests to Zoo.dev
// Uses Edge runtime (no @vercel/node needed, native Request/Response Web APIs)
// Each individual Zoo.dev API call is fast; the 30-90s job duration is handled
// by the backend polling loop making multiple GET requests through this proxy.
export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-proxy-key',
      },
    });
  }

  // Simple shared secret check
  const proxyKey = req.headers.get('x-proxy-key');
  if (proxyKey !== 'scalecad-zoo-proxy-2024') {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get the Zoo.dev path from the request URL
  const url = new URL(req.url);
  const zooPath = url.searchParams.get('path') || '';
  if (!zooPath) {
    return new Response('Missing path parameter', { status: 400 });
  }

  const zooUrl = new URL(zooPath, 'https://api.zoo.dev');

  // Forward query params (except 'path')
  url.searchParams.forEach((value, key) => {
    if (key !== 'path') zooUrl.searchParams.set(key, value);
  });

  // Forward the request to Zoo.dev
  const zooResp = await fetch(zooUrl.toString(), {
    method: req.method,
    headers: {
      'Authorization': req.headers.get('authorization') || '',
      'Content-Type': req.headers.get('content-type') || 'application/json',
    },
    body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
  });

  return new Response(zooResp.body, {
    status: zooResp.status,
    headers: {
      'Content-Type': zooResp.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
