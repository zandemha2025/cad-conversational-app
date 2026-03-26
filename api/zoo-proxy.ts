// api/zoo-proxy.ts - Vercel serverless proxy for Zoo.dev (bypasses Fly.io blocked IPs)
export const config = {
  maxDuration: 120, // Zoo.dev text-to-cad takes 30-90s
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

  // Forward the request
  const zooResp = await fetch(zooUrl.toString(), {
    method: req.method,
    headers: {
      'Authorization': req.headers.get('authorization') || '',
      'Content-Type': req.headers.get('content-type') || 'application/json',
    },
    body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
  });

  // Return the response
  return new Response(zooResp.body, {
    status: zooResp.status,
    headers: {
      'Content-Type': zooResp.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
