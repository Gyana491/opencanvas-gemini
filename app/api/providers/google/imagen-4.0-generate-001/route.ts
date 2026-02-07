import { NextRequest, NextResponse } from 'next/server';
import { experimental_generateImage as generateImage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Server configuration error: Missing API Key' },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { prompt, aspectRatio } = body;

        if (!prompt) {
            return NextResponse.json(
                { error: 'Missing prompt' },
                { status: 400 }
            );
        }

        const google = createGoogleGenerativeAI({ apiKey });

        const { image } = await generateImage({
            model: google.image('imagen-4.0-generate-001'),
            prompt,
            aspectRatio: aspectRatio,
        });

        // The AI SDK returns a base64 string for the image
        return NextResponse.json({
            image: {
                base64: image.base64
            }
        });

    } catch (error: any) {
        console.error('Error in imagen-4.0-generate-001 route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
