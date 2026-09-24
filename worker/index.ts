import { getRegulatedRegion, type CloudflareRegionProperties } from './region.ts';

type CloudflareRequest = Request & {
  cf?: CloudflareRegionProperties | null;
};

type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

export default {
  async fetch(request: CloudflareRequest, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/api/privacy-region') {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET') {
      return new Response(null, {
        status: 405,
        headers: {
          ...JSON_HEADERS,
          Allow: 'GET',
        },
      });
    }

    return new Response(JSON.stringify({
      regulated: getRegulatedRegion(request.cf),
    }), {
      headers: JSON_HEADERS,
    });
  },
};
