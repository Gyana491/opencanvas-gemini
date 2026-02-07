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
        const name = url.searchParams.get('name');

        if (!name) {
            return NextResponse.json(
                { error: 'Missing operation name' },
                { status: 400 }
            );
        }

        // Forward the request to Google API
        // https://generativelanguage.googleapis.com/v1beta/{name}
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${name}`,
            {
                method: 'GET',
                headers: {
                    'x-goog-api-key': apiKey,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `Google API Error: ${response.statusText}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in operations route:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
