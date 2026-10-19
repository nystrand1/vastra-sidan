import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

const ALLOWED_HOSTNAMES = [
  'api.vastrasidan.se',
  'www.vastrasidan.se',
  'cmsdev.vastrasidan.se',
  'www.cmsdev.vastrasidan.se',
]

// The proxy serves member card textures (GLB models and images). Anything else
// is sent as an opaque download, so an upstream file can never run as HTML or
// script on our origin.
const SAFE_CONTENT_TYPES = [
  'model/gltf-binary',
  'image/png',
  'image/jpeg',
  'image/webp',
]

const parseTargetUrl = (value: string) => {
  try {
    const target = new URL(value);
    if (target.protocol !== 'https:') return null;
    if (target.username || target.password) return null;
    if (target.port) return null;
    if (!ALLOWED_HOSTNAMES.includes(target.hostname)) return null;
    return target;
  } catch {
    return null;
  }
}

const MAX_REDIRECTS = 3;

/** Fetches the URL, following redirects only while they stay on the allowlist. */
const fetchAllowed = async (targetUrl: URL) => {
  let current: URL | null = targetUrl;
  for (let hop = 0; current && hop <= MAX_REDIRECTS; hop++) {
    // Never forward the visitor's headers (cookies, auth) to the upstream server.
    const response: Response = await fetch(current, {
      redirect: 'manual',
      next: {
        revalidate: 3600 * 24 * 30, // 30 days
      }
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) {
      return response;
    }
    current = parseTargetUrl(new URL(location, current).toString());
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetParam = url.searchParams.get('url');
    if (!targetParam) {
      return NextResponse.json({ error: 'No target URL provided' }, { status: 400 });
    }

    const targetUrl = parseTargetUrl(targetParam);
    if (!targetUrl) {
      return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 });
    }

    const response = await fetchAllowed(targetUrl);
    if (!response?.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
    }

    const upstreamType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const headers = new Headers({
      'Content-Type': SAFE_CONTENT_TYPES.includes(upstreamType) ? upstreamType : 'application/octet-stream',
      'Content-Disposition': 'attachment',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    // fetch() decompresses the body, so the upstream length is only right when it wasn't compressed.
    const contentLength = response.headers.get('content-length');
    if (contentLength && !response.headers.has('content-encoding')) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    console.log('Proxy error', error);
    captureException(error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
