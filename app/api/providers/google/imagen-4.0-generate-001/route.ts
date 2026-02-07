import { NextRequest, NextResponse } from 'next/server';
import { experimental_generateImage as generateImage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { uploadFile } from '@/lib/r2';
import { nanoid } from 'nanoid';

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
        const { prompt, aspectRatio, workflowId, nodeId } = body;

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

        // Convert base64 to buffer
        const buffer = Buffer.from(image.base64, 'base64');
        const fileName = `imagen_${Date.now()}_${nanoid()}.png`;

        // Define storage key
        // If workflowId is not provided (e.g. playground), store in temporary/global
        const storageKey = workflowId
            ? `workflows/${workflowId}/${nodeId || 'generated'}/${fileName}`
            : `temp/${nanoid()}/${fileName}`;

        // Upload to R2
        const url = await uploadFile(buffer, storageKey, 'image/png');

        return NextResponse.json({
            url: url,
            success: true
        });

    } catch (error: any) {
        console.error('Error in imagen-4.0-generate-001 route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
