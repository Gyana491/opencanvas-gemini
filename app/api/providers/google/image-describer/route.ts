import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

type EncodedImage = {
    mimeType: string;
    base64Data: string;
};

type DescribeRequestBody = {
    images?: Array<Partial<EncodedImage>>;
    prompt?: string;
    model?: string;
    systemInstruction?: string;
};

const DEFAULT_SINGLE_IMAGE_PROMPT =
    'Describe this image clearly with key objects, setting, actions, colors, and text if present.';
const DEFAULT_MULTI_IMAGE_PROMPT =
    'Describe these images and highlight notable similarities and differences.';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const SUPPORTED_MODELS = new Set([
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
]);

function extractText(response: GenerateContentResponse): string {
    if (typeof response.text === 'string' && response.text.trim().length > 0) {
        return response.text.trim();
    }

    const candidateParts = response.candidates?.flatMap((candidate) => {
        return candidate.content?.parts || [];
    }) || [];

    const text = candidateParts
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .filter((part) => part.trim().length > 0)
        .join('\n')
        .trim();

    return text;
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Server configuration error: Missing API Key' },
                { status: 500 }
            );
        }

        const body = (await req.json()) as DescribeRequestBody;
        const validImages = (Array.isArray(body.images) ? body.images : [])
            .filter((image): image is EncodedImage => {
                return (
                    typeof image?.mimeType === 'string' &&
                    image.mimeType.startsWith('image/') &&
                    typeof image.base64Data === 'string' &&
                    image.base64Data.length > 0
                );
            });

        if (validImages.length === 0) {
            return NextResponse.json(
                { error: 'At least one encoded image is required.' },
                { status: 400 }
            );
        }

        const prompt = typeof body.prompt === 'string' && body.prompt.trim().length > 0
            ? body.prompt.trim()
            : validImages.length > 1
                ? DEFAULT_MULTI_IMAGE_PROMPT
                : DEFAULT_SINGLE_IMAGE_PROMPT;
        const selectedModel = typeof body.model === 'string' && SUPPORTED_MODELS.has(body.model)
            ? body.model
            : DEFAULT_MODEL;
        const systemInstruction = typeof body.systemInstruction === 'string' && body.systemInstruction.trim().length > 0
            ? body.systemInstruction.trim()
            : undefined;

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: selectedModel,
            config: systemInstruction
                ? {
                    systemInstruction,
                }
                : undefined,
            contents: [
                {
                    parts: [
                        ...validImages.map((image) => ({
                            inlineData: {
                                mimeType: image.mimeType,
                                data: image.base64Data,
                            },
                        })),
                        { text: prompt },
                    ],
                },
            ],
        });

        const text = extractText(response);
        if (!text) {
            return NextResponse.json(
                { error: 'Model did not return a description.' },
                { status: 502 }
            );
        }

        return NextResponse.json({
            success: true,
            text,
            model: selectedModel,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Error in image-describer route:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
