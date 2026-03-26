export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const proxyKey = request.headers.get('x-proxy-key');
  if (proxyKey !== 'scalecad-zoo-proxy-2024') {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const zooPath = url.searchParams.get('zoo_path') || '/ai/text-to-cad/glb';
  const zooUrl = new URL(zooPath, 'https://api.zoo.dev');

  // Forward non-proxy query params
  url.searchParams.forEach((v, k) => {
    if (k !== 'zoo_path') zooUrl.searchParams.set(k, v);
  });

  const resp = await fetch(zooUrl.toString(), {
    method: request.method,
    headers: {
      'Authorization': request.headers.get('authorization') || '',
      'Content-Type': 'application/json',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'Content-Type': resp.headers.get('content-type') || 'application/json',
    },
  });
}
