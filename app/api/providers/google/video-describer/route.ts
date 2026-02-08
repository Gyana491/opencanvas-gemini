import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
    createPartFromUri,
    createUserContent,
    GoogleGenAI,
    type GenerateContentResponse,
} from '@google/genai';

type EncodedVideo = {
    mimeType: string;
    base64Data: string;
    sourceUrl?: string;
};

type VideoDescribeRequestBody = {
    video?: Partial<EncodedVideo>;
    prompt?: string;
    model?: string;
    systemInstruction?: string;
};

type ResolvedVideoPayload =
    | {
        mode: 'youtube';
        fileUri: string;
    }
    | {
        mode: 'bytes';
        mimeType: string;
        bytes: Buffer;
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
const DEFAULT_PROMPT =
    'Describe this video with key visual and audio events. Include concise timestamps (MM:SS) for important moments.';
const INLINE_REQUEST_LIMIT_BYTES = 20 * 1024 * 1024;

const parseMimeType = (value?: string | null): string | undefined => {
    if (!value) return undefined;
    return value.split(';')[0]?.trim() || undefined;
};

const isYouTubeUrl = (value: string): boolean => {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(value);
};

const guessVideoMimeTypeFromUrl = (urlValue: string): string => {
    const clean = urlValue.split('?')[0].toLowerCase();
    if (clean.endsWith('.webm')) return 'video/webm';
    if (clean.endsWith('.mov')) return 'video/mov';
    if (clean.endsWith('.avi')) return 'video/avi';
    if (clean.endsWith('.mpeg') || clean.endsWith('.mpg')) return 'video/mpeg';
    if (clean.endsWith('.wmv')) return 'video/wmv';
    if (clean.endsWith('.3gp') || clean.endsWith('.3gpp')) return 'video/3gpp';
    return 'video/mp4';
};

const getFileExtensionFromMime = (mimeType: string): string => {
    switch (mimeType) {
        case 'video/webm':
            return 'webm';
        case 'video/mov':
            return 'mov';
        case 'video/avi':
            return 'avi';
        case 'video/mpeg':
        case 'video/mpg':
            return 'mpeg';
        case 'video/wmv':
            return 'wmv';
        case 'video/3gpp':
            return '3gp';
        default:
            return 'mp4';
    }
};

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

const resolveVideoPayload = async (video: Partial<EncodedVideo> | undefined): Promise<ResolvedVideoPayload> => {
    const sourceUrl = typeof video?.sourceUrl === 'string' ? video.sourceUrl.trim() : '';
    const base64Data = typeof video?.base64Data === 'string' ? video.base64Data.trim() : '';
    const mimeTypeFromBody = typeof video?.mimeType === 'string' ? video.mimeType.trim() : '';

    if (sourceUrl) {
        if (sourceUrl.startsWith('blob:')) {
            if (!base64Data) {
                throw new Error('Blob video input requires encoded video bytes.');
            }
            const mimeType = mimeTypeFromBody || 'video/mp4';
            return {
                mode: 'bytes',
                mimeType,
                bytes: Buffer.from(base64Data, 'base64'),
            };
        }

        if (isYouTubeUrl(sourceUrl)) {
            return {
                mode: 'youtube',
                fileUri: sourceUrl,
            };
        }

        if (!/^https?:\/\//i.test(sourceUrl)) {
            throw new Error('Video source URL must be a valid http(s) URL, YouTube URL, or encoded blob payload.');
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch video URL: ${sourceUrl}`);
        }

        const mimeType = parseMimeType(response.headers.get('content-type')) || guessVideoMimeTypeFromUrl(sourceUrl);
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
            mode: 'bytes',
            mimeType,
            bytes,
        };
    }

    if (base64Data) {
        const mimeType = mimeTypeFromBody || 'video/mp4';
        return {
            mode: 'bytes',
            mimeType,
            bytes: Buffer.from(base64Data, 'base64'),
        };
    }

    throw new Error('A connected video input is required.');
};

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    let uploadedFileName: string | undefined;
    let tempFilePath: string | undefined;

    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Server configuration error: Missing API Key' },
                { status: 500 }
            );
        }

        const body = (await req.json()) as VideoDescribeRequestBody;
        const prompt = typeof body.prompt === 'string' && body.prompt.trim().length > 0
            ? body.prompt.trim()
            : DEFAULT_PROMPT;
        const selectedModel = typeof body.model === 'string' && SUPPORTED_MODELS.has(body.model)
            ? body.model
            : DEFAULT_MODEL;
        const systemInstruction = typeof body.systemInstruction === 'string' && body.systemInstruction.trim().length > 0
            ? body.systemInstruction.trim()
            : undefined;

        const resolvedVideo = await resolveVideoPayload(body.video);
        const ai = new GoogleGenAI({ apiKey });

        let response: GenerateContentResponse;
        if (resolvedVideo.mode === 'youtube') {
            response = await ai.models.generateContent({
                model: selectedModel,
                config: systemInstruction
                    ? {
                        systemInstruction,
                    }
                    : undefined,
                contents: [
                    {
                        parts: [
                            {
                                fileData: {
                                    fileUri: resolvedVideo.fileUri,
                                    mimeType: 'video/*',
                                },
                            },
                            { text: prompt },
                        ],
                    },
                ],
            });
        } else if (resolvedVideo.bytes.byteLength <= INLINE_REQUEST_LIMIT_BYTES) {
            response = await ai.models.generateContent({
                model: selectedModel,
                config: systemInstruction
                    ? {
                        systemInstruction,
                    }
                    : undefined,
                contents: [
                    {
                        parts: [
                            {
                                inlineData: {
                                    mimeType: resolvedVideo.mimeType,
                                    data: resolvedVideo.bytes.toString('base64'),
                                },
                            },
                            { text: prompt },
                        ],
                    },
                ],
            });
        } else {
            const extension = getFileExtensionFromMime(resolvedVideo.mimeType);
            tempFilePath = path.join(tmpdir(), `video-describer-${randomUUID()}.${extension}`);
            await writeFile(tempFilePath, resolvedVideo.bytes);

            const uploadedFile = await ai.files.upload({
                file: tempFilePath,
                config: { mimeType: resolvedVideo.mimeType },
            });
            if (!uploadedFile.uri) {
                throw new Error('Failed to upload video to Files API.');
            }
            uploadedFileName = uploadedFile.name;

            response = await ai.models.generateContent({
                model: selectedModel,
                config: systemInstruction
                    ? {
                        systemInstruction,
                    }
                    : undefined,
                contents: createUserContent([
                    createPartFromUri(uploadedFile.uri, uploadedFile.mimeType || resolvedVideo.mimeType),
                    prompt,
                ]),
            });
        }

        const text = extractText(response);
        if (!text) {
            return NextResponse.json(
                { error: 'Model did not return a video description.' },
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
        console.error('Error in video-describer route:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    } finally {
        if (tempFilePath) {
            await unlink(tempFilePath).catch(() => undefined);
        }
        if (uploadedFileName) {
            const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
            if (apiKey) {
                const ai = new GoogleGenAI({ apiKey });
                await ai.files.delete({ name: uploadedFileName }).catch(() => undefined);
            }
        }
    }
}
