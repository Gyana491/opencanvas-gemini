import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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

        const ai = new GoogleGenAI({ apiKey });

        // Frontend sends Vertex-style payload: { instances: [{ prompt: "...", image?: {...} }], parameters: {...} }
        // SDK expects: { model: "...", prompt: "...", config: {...} }
        // Transform the request format

        let prompt: string = '';
        let image: any = undefined;

        // Extract prompt and image from instances array (Vertex format)
        if (body.instances && Array.isArray(body.instances) && body.instances.length > 0) {
            const instance = body.instances[0];
            prompt = instance.prompt || '';
            image = instance.image;
        }

        // Fallback: check if prompt is at top level
        if (!prompt && body.prompt) {
            prompt = body.prompt;
        }

        if (!prompt) {
            return NextResponse.json(
                { error: 'Missing prompt in request' },
                { status: 400 }
            );
        }

        // Build config from parameters (Vertex format) or body.config
        const config: any = {};
        const params = body.parameters || body.config || {};

        if (params.aspectRatio) {
            config.aspectRatio = params.aspectRatio;
        }
        if (params.durationSeconds) {
            // SDK might expect number or string, convert to number
            config.durationSeconds = parseInt(params.durationSeconds, 10);
        }
        if (params.resolution) {
            config.resolution = params.resolution;
        }
        if (params.referenceImages) {
            config.referenceImages = params.referenceImages;
        }

        // If first frame image is provided, add to config
        if (image) {
            config.image = image;
        }

        const response = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt,
            config: Object.keys(config).length > 0 ? config : undefined
        });

        // The response from generateVideos is an Operation object.
        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Error in veo-3.1-generate-preview route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
