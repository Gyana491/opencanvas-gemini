import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
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

        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: aspectRatio || '1:1',
            }
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const generatedImage = response.generatedImages[0];
            const imgBytes = generatedImage.image?.imageBytes; // Access imageBytes from image object

            if (imgBytes) {
                const buffer = Buffer.from(imgBytes, "base64");
                // Mime type isn't explicitly returned in the example, but usually png/jpeg.
                // The example saves as png. Let's assume png or detect? 
                // The example doesn't show mime type access.
                // We'll default to image/png for R2.
                const mimeType = 'image/png';
                const ext = 'png';
                const fileName = `imagen_${Date.now()}_${nanoid()}.${ext}`;

                const storageKey = workflowId
                    ? `workflows/${workflowId}/${nodeId || 'generated'}/${fileName}`
                    : `temp/${nanoid()}/${fileName}`;

                const url = await uploadFile(buffer, storageKey, mimeType);

                return NextResponse.json({
                    url: url,
                    success: true
                });
            }
        }

        return NextResponse.json({ error: 'No image generated' }, { status: 500 });

    } catch (error: any) {
        console.error('Error in imagen route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
