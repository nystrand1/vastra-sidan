import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return NextResponse.json({ error: 'No target URL provided' }, { status: 400 });
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