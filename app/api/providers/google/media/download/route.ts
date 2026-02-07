import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Server configuration error: Missing API Key' },
                { status: 500 }
            );
        }

        const url = new URL(req.url);
        const videoUri = url.searchParams.get('uri');

        if (!videoUri) {
            return NextResponse.json(
                { error: 'Missing video URI' },
                { status: 400 }
            );
        }

        // Forward the request to Google API to fetch the video content
        const response = await fetch(videoUri, {
            headers: {
                'x-goog-api-key': apiKey,
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Google API Error: ${response.statusText}` },
                { status: response.status }
            );
        }

        const blob = await response.blob();

        return new NextResponse(blob, {
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
                'Content-Length': response.headers.get('Content-Length') || '',
            },
        });
    } catch (error) {
        console.error('Error in media download route:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
