import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

type EncodedImage = {
    mimeType: string;
    base64Data: string;
};

type PromptEnhancerRequestBody = {
    prompt?: string;
    images?: Array<Partial<EncodedImage>>;
    model?: string;
    systemInstruction?: string;
};

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

const DEFAULT_SYSTEM_INSTRUCTION =
    'Your job is to write prompts for text-to-image models. Your input will be a general description for the scene. Write a detailed prompt without any additions, and keep it to no more than 3 sentences.';

function extractText(response: GenerateContentResponse): string {
    if (typeof response.text === 'string' && response.text.trim().length > 0) {
        return response.text.trim();
    }

    const candidateParts = response.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    return candidateParts
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .filter((part) => part.trim().length > 0)
        .join('\n')
        .trim();
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

        const body = (await req.json()) as PromptEnhancerRequestBody;
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt is required.' },
                { status: 400 }
            );
        }
        const validImages = (Array.isArray(body.images) ? body.images : [])
            .filter((image): image is EncodedImage => {
                return (
                    typeof image?.mimeType === 'string' &&
                    image.mimeType.startsWith('image/') &&
                    typeof image.base64Data === 'string' &&
                    image.base64Data.length > 0
                );
            });

        const selectedModel = typeof body.model === 'string' && SUPPORTED_MODELS.has(body.model)
            ? body.model
            : DEFAULT_MODEL;
        const systemInstruction = typeof body.systemInstruction === 'string' && body.systemInstruction.trim().length > 0
            ? body.systemInstruction.trim()
            : DEFAULT_SYSTEM_INSTRUCTION;

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: selectedModel,
            config: {
                systemInstruction,
            },
            contents: [
                {
                    parts: [
                        ...validImages.map((image) => ({
                            inlineData: {
                                mimeType: image.mimeType,
                                data: image.base64Data,
                            },
                        })),
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        });

        const text = extractText(response);
        if (!text) {
            return NextResponse.json(
                { error: 'Model did not return an enhanced prompt.' },
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
        console.error('Error in prompt-enhancer route:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
