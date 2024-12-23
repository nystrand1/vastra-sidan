import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://api.vastrasidan.se',
  'https://www.vastrasidan.se',
  'https://cmsdev.vastrasidan.se',
  'https://www.cmsdev.vastrasidan.se',
]

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return NextResponse.json({ error: 'No target URL provided' }, { status: 400 });
    }

    const allowedUrl = ALLOWED_ORIGINS.find((origin) => targetUrl.startsWith(origin));
    if (!allowedUrl) {
      return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 });
    }

    const response = await fetch(targetUrl, {
      headers: request.headers,
      next: {
        revalidate: 3600 * 24 * 30, // 30 days
      }
    });


    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.log('Proxy error', error);  
    captureException(error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}