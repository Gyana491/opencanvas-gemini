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

        // Get operation status using fetch
        // Note: getVideosOperation requires the full operation object from generateVideos,
        // but this route only receives the operation name. Using fetch for name-based lookup.
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${name}`,
            {
                headers: {
                    'x-goog-api-key': apiKey,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to check operation status: ${response.statusText}`);
        }

        const result = await response.json();

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error in operations route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
