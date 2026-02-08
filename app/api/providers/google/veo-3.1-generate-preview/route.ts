import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const parseMimeType = (value?: string | null): string | undefined => {
    if (!value) return undefined;
    return value.split(';')[0]?.trim() || undefined;
};

const guessImageMimeTypeFromUrl = (url: string): string => {
    const clean = url.split('?')[0].toLowerCase();
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.heic')) return 'image/heic';
    if (clean.endsWith('.heif')) return 'image/heif';
    return 'image/png';
};

const guessVideoMimeTypeFromUrl = (url: string): string => {
    const clean = url.split('?')[0].toLowerCase();
    if (clean.endsWith('.webm')) return 'video/webm';
    if (clean.endsWith('.mov')) return 'video/mov';
    if (clean.endsWith('.avi')) return 'video/avi';
    if (clean.endsWith('.mpeg') || clean.endsWith('.mpg')) return 'video/mpeg';
    return 'video/mp4';
};

const parseDataUrl = (value: string): { mimeType: string; data: string } | null => {
    const match = value.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
};

const resolveImageFromInput = async (input: unknown): Promise<any | undefined> => {
    if (!input) return undefined;

    if (typeof input === 'string') {
        const raw = input.trim();
        if (!raw) return undefined;

        if (raw.startsWith('blob:')) {
            throw new Error('Received blob URL for image input. Blob URLs are browser-local and must be uploaded to a public URL before calling the Veo API route.');
        }

        if (raw.startsWith('gs://')) {
            return { gcsUri: raw };
        }

        const dataUrl = parseDataUrl(raw);
        if (dataUrl) {
            return { imageBytes: dataUrl.data, mimeType: dataUrl.mimeType };
        }

        if (/^https?:\/\//i.test(raw)) {
            const response = await fetch(raw);
            if (!response.ok) {
                throw new Error(`Failed to fetch image URL: ${raw}`);
            }

            const mimeType = parseMimeType(response.headers.get('content-type')) || guessImageMimeTypeFromUrl(raw);
            const bytes = Buffer.from(await response.arrayBuffer()).toString('base64');
            return { imageBytes: bytes, mimeType };
        }

        return undefined;
    }

    if (typeof input === 'object') {
        const candidate = input as any;

        if (typeof candidate.gcsUri === 'string' && candidate.gcsUri.trim()) {
            return { gcsUri: candidate.gcsUri.trim() };
        }

        if (typeof candidate.imageBytes === 'string' && candidate.imageBytes.trim()) {
            return {
                imageBytes: candidate.imageBytes,
                mimeType: candidate.mimeType || 'image/png',
            };
        }

        if (typeof candidate.bytesBase64Encoded === 'string' && candidate.bytesBase64Encoded.trim()) {
            return {
                imageBytes: candidate.bytesBase64Encoded,
                mimeType: candidate.mimeType || 'image/png',
            };
        }

        if (candidate.inlineData?.data) {
            return {
                imageBytes: candidate.inlineData.data,
                mimeType: candidate.inlineData.mimeType || 'image/png',
            };
        }

        if (typeof candidate.uri === 'string' && candidate.uri.trim()) {
            return resolveImageFromInput(candidate.uri);
        }

        if (typeof candidate.url === 'string' && candidate.url.trim()) {
            return resolveImageFromInput(candidate.url);
        }
    }

    return undefined;
};

const resolveVideoFromInput = async (input: unknown): Promise<any | undefined> => {
    if (!input) return undefined;

    if (typeof input === 'string') {
        const raw = input.trim();
        if (!raw) return undefined;

        if (raw.startsWith('blob:')) {
            throw new Error('Received blob URL for video input. Blob URLs are browser-local and must be uploaded to a public URL before calling the Veo API route.');
        }

        const dataUrl = parseDataUrl(raw);
        if (dataUrl) {
            return { videoBytes: dataUrl.data, mimeType: dataUrl.mimeType };
        }

        if (/^https?:\/\//i.test(raw)) {
            const response = await fetch(raw);
            if (!response.ok) {
                throw new Error(`Failed to fetch video URL: ${raw}`);
            }

            const mimeType = parseMimeType(response.headers.get('content-type')) || guessVideoMimeTypeFromUrl(raw);
            const bytes = Buffer.from(await response.arrayBuffer()).toString('base64');
            return { videoBytes: bytes, mimeType };
        }

        if (raw.startsWith('gs://')) {
            return { uri: raw };
        }

        return undefined;
    }

    if (typeof input === 'object') {
        const candidate = input as any;

        if (typeof candidate.videoBytes === 'string' && candidate.videoBytes.trim()) {
            return {
                videoBytes: candidate.videoBytes,
                mimeType: candidate.mimeType || 'video/mp4',
            };
        }

        if (typeof candidate.bytesBase64Encoded === 'string' && candidate.bytesBase64Encoded.trim()) {
            return {
                videoBytes: candidate.bytesBase64Encoded,
                mimeType: candidate.mimeType || 'video/mp4',
            };
        }

        if (typeof candidate.uri === 'string' && candidate.uri.trim()) {
            return resolveVideoFromInput(candidate.uri);
        }

        if (typeof candidate.url === 'string' && candidate.url.trim()) {
            return resolveVideoFromInput(candidate.url);
        }
    }

    return undefined;
};

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
        let imageInput: unknown = undefined;
        let videoInput: unknown = undefined;

        // Extract prompt and image from instances array (Vertex format)
        if (body.instances && Array.isArray(body.instances) && body.instances.length > 0) {
            const instance = body.instances[0];
            prompt = instance.prompt || '';
            imageInput = instance.image || instance.imageUrl;
            videoInput = instance.video || instance.videoUrl;
        }

        // Fallback: check if prompt is at top level
        if (!prompt && body.prompt) {
            prompt = body.prompt;
        }
        if (!imageInput) {
            imageInput = body.image || body.imageUrl;
        }
        if (!videoInput) {
            videoInput = body.video || body.videoUrl;
        }

        if (!prompt) {
            return NextResponse.json(
                { error: 'Missing prompt in request' },
                { status: 400 }
            );
        }

        console.log('[Veo Route][Input Body Summary]', {
            hasPrompt: Boolean(prompt),
            imageInputType: typeof imageInput,
            videoInputType: typeof videoInput,
            hasImageUrl: typeof body.imageUrl === 'string',
            hasLastFrameUrl: typeof body.lastFrameUrl === 'string',
            referenceImageUrlCount: Array.isArray(body.referenceImageUrls) ? body.referenceImageUrls.length : 0,
            hasConfig: Boolean(body.parameters || body.config),
        });

        // Build config from parameters (Vertex format) or body.config
        const config: any = {};
        const params = body.parameters || body.config || {};

        if (params.aspectRatio) {
            config.aspectRatio = params.aspectRatio;
        }
        if (params.durationSeconds) {
            // SDK might expect number or string, convert to number
            const parsedDuration = parseInt(params.durationSeconds, 10);
            if (!Number.isNaN(parsedDuration)) {
                config.durationSeconds = parsedDuration;
            }
        }
        if (params.resolution) {
            config.resolution = params.resolution;
        }
        if (params.negativePrompt) {
            config.negativePrompt = params.negativePrompt;
        }
        if (params.personGeneration) {
            config.personGeneration = params.personGeneration;
        }
        if (Array.isArray(params.referenceImages) && params.referenceImages.length > 0) {
            const normalizedReferenceImages = await Promise.all(
                params.referenceImages.map(async (referenceImage: any) => {
                    const normalizedImage = await resolveImageFromInput(referenceImage?.image || referenceImage);
                    if (!normalizedImage) return null;
                    return {
                        image: normalizedImage,
                        referenceType: referenceImage?.referenceType || 'asset',
                    };
                })
            );
            config.referenceImages = normalizedReferenceImages.filter(Boolean);
        } else if (Array.isArray(body.referenceImageUrls) && body.referenceImageUrls.length > 0) {
            const normalizedReferenceImages = await Promise.all(
                body.referenceImageUrls.map(async (imageUrl: unknown) => {
                    const normalizedImage = await resolveImageFromInput(imageUrl);
                    if (!normalizedImage) return null;
                    return {
                        image: normalizedImage,
                        referenceType: 'asset',
                    };
                })
            );
            config.referenceImages = normalizedReferenceImages.filter(Boolean);
        } else if (Array.isArray(body.images) && body.images.length > 0) {
            const normalizedReferenceImages = await Promise.all(
                body.images.map(async (referenceImage: any) => {
                    const normalizedImage = await resolveImageFromInput(referenceImage?.image || referenceImage);
                    if (!normalizedImage) return null;
                    return {
                        image: normalizedImage,
                        referenceType: referenceImage?.referenceType || 'asset',
                    };
                })
            );
            config.referenceImages = normalizedReferenceImages.filter(Boolean);
        }

        const lastFrameInput = params.lastFrame || body.lastFrame || body.lastFrameUrl;
        if (lastFrameInput) {
            const normalizedLastFrame = await resolveImageFromInput(lastFrameInput);
            if (normalizedLastFrame) {
                config.lastFrame = normalizedLastFrame;
            }
        }

        const image = await resolveImageFromInput(imageInput);
        const video = await resolveVideoFromInput(videoInput);

        // Veo 3.1 personGeneration requirements:
        // - text-to-video & extension: allow_all
        // - image-to-video, interpolation, reference images: allow_adult
        const hasReferenceImages = Array.isArray(config.referenceImages) && config.referenceImages.length > 0;
        const hasImageBasedGeneration = Boolean(image || config.lastFrame || hasReferenceImages);
        if (!config.personGeneration) {
            config.personGeneration = hasImageBasedGeneration ? 'allow_adult' : 'allow_all';
        }

        // Interpolation (first + last frame) is most reliable at 8s for Veo 3.1.
        if (image && config.lastFrame && config.durationSeconds && config.durationSeconds !== 8) {
            console.log('[Veo Route][Config Override]', {
                reason: 'Interpolation detected, overriding durationSeconds to 8',
                from: config.durationSeconds,
                to: 8,
            });
            config.durationSeconds = 8;
        }

        console.log('[Veo Route][Resolved Inputs]', {
            hasImage: Boolean(image),
            imageMimeType: image?.mimeType,
            imageFromGcs: Boolean(image?.gcsUri),
            hasVideo: Boolean(video),
            videoMimeType: video?.mimeType,
            videoFromUri: Boolean(video?.uri),
            hasLastFrame: Boolean(config.lastFrame),
            referenceImageCount: Array.isArray(config.referenceImages) ? config.referenceImages.length : 0,
            personGeneration: config.personGeneration,
            durationSeconds: config.durationSeconds,
            aspectRatio: config.aspectRatio,
            resolution: config.resolution,
        });

        if (image && video) {
            return NextResponse.json(
                { error: 'Provide either image or video input, not both.' },
                { status: 400 }
            );
        }

        if (config.lastFrame && !image) {
            return NextResponse.json(
                { error: 'Last frame requires first frame image input.' },
                { status: 400 }
            );
        }

        // Veo 3.1 does not support combining reference images with image/video/lastFrame inputs.
        if (
            Array.isArray(config.referenceImages) &&
            config.referenceImages.length > 0 &&
            (image || video || config.lastFrame)
        ) {
            return NextResponse.json(
                { error: 'Reference images cannot be combined with first-frame image, last-frame image, or input video in the same request.' },
                { status: 400 }
            );
        }

        const response = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt,
            image: image,
            video: video,
            config: Object.keys(config).length > 0 ? config : undefined
        });

        return NextResponse.json({
            success: true,
            operationName: response.name,
            operation: response,
        });

    } catch (error: any) {
        console.error('Error in veo-3.1-generate-preview route:', error);
        const statusCode = typeof error?.status === 'number' ? error.status : 500;
        const rawMessage = error?.message || 'Internal Server Error';
        const hint =
            statusCode === 400 && /use case is currently not supported/i.test(rawMessage)
                ? ' Try durationSeconds=8 and image-based personGeneration=allow_adult.'
                : '';

        return NextResponse.json(
            { error: `${rawMessage}${hint}`.trim() },
            { status: statusCode }
        );
    }
}
