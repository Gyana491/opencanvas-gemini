import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/r2';
import { nanoid } from 'nanoid';

const firstNonEmptyString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }
    return undefined;
};

const extractVideoUri = (result: any): string | undefined => {
    const directUri = firstNonEmptyString(
        result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri,
        result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.downloadUri,
        result?.response?.generatedVideos?.[0]?.video?.uri,
        result?.response?.generatedVideos?.[0]?.video?.downloadUri,
        result?.response?.generatedVideos?.[0]?.uri,
        result?.response?.generated_videos?.[0]?.video?.uri,
        result?.response?.generated_videos?.[0]?.video?.download_uri,
        result?.response?.generated_videos?.[0]?.uri,
    );

    if (directUri) {
        return directUri;
    }

    const fileName = firstNonEmptyString(
        result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.name,
        result?.response?.generatedVideos?.[0]?.video?.name,
        result?.response?.generated_videos?.[0]?.video?.name
    );

    if (fileName) {
        const cleanFileName = fileName.replace(/^\/+/, '');
        return `https://generativelanguage.googleapis.com/v1beta/${cleanFileName}:download`;
    }

    return undefined;
};

const extractInlineBase64Video = (result: any): string | undefined => {
    return firstNonEmptyString(
        result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.bytesBase64Encoded,
        result?.response?.generatedVideos?.[0]?.video?.bytesBase64Encoded,
        result?.response?.generatedVideos?.[0]?.video?.videoBytes,
        result?.response?.generated_videos?.[0]?.video?.bytes_base64_encoded,
        result?.response?.generated_videos?.[0]?.video?.video_bytes,
    );
};

export async function GET(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Server configuration error: Missing API Key' },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(req.url);
        const name = searchParams.get('name');
        const workflowId = searchParams.get('workflowId');
        const nodeId = searchParams.get('nodeId');

        if (!name) {
            return NextResponse.json({ error: 'Missing operation name' }, { status: 400 });
        }

        // Check operation status using fetch with retry logic
        // Note: getVideosOperation requires the full operation object from generateVideos,
        // but this route only receives the operation name. Using fetch for name-based lookup.
        const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    return response;
                } catch (error: any) {
                    console.warn(`[Veo Status] Fetch attempt ${i + 1} failed:`, error.code || error.message);
                    if (i === retries - 1) throw error;
                    // Wait before retry with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
            throw new Error('All retry attempts failed');
        };

        const response = await fetchWithRetry(
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

        const result: any = await response.json();

        if (result.done) {
            if (result.error) {
                return NextResponse.json({
                    state: 'error',
                    done: true,
                    error: {
                        message: result.error?.message || 'Video generation failed',
                    },
                });
            }

            let videoBuffer: Buffer | undefined;
            const inlineBase64Video = extractInlineBase64Video(result);

            if (inlineBase64Video) {
                videoBuffer = Buffer.from(inlineBase64Video, 'base64');
            } else {
                const videoUri = extractVideoUri(result);
                if (!videoUri) {
                    return NextResponse.json({
                        state: 'error',
                        done: true,
                        error: 'No video URL in response',
                        details: { responseKeys: Object.keys(result?.response || {}) }
                    });
                }

                // Download the video server-side
                // Using fetch here is acceptable as it's a file download, not an API call per se.
                // But we should header inject the key if needed.
                // skill.md suggests appending key for veos.
                // The URL construction logic in extractVideoUri does not append key by default unless it's the specific download endpoint.

                // If it is 'generativelanguage...:download', it needs auth.
                // If it is a public URI (unlikely for Veo), it might not.
                // Assuming auth needed.
                const videoResponse = await fetch(videoUri, {
                    headers: {
                        'x-goog-api-key': apiKey,
                    },
                });

                if (!videoResponse.ok) {
                    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
                }

                videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
            }

            const fileName = `veo_${Date.now()}_${nanoid()}.mp4`;

            // Always persist generated videos under workflows/* so they remain durable in R2.
            const resolvedWorkflowId =
                workflowId && workflowId.trim() && workflowId !== 'new'
                    ? workflowId.trim()
                    : `unsaved-${nanoid()}`;
            const storageKey = `workflows/${resolvedWorkflowId}/videos/${nodeId || 'generated'}/${fileName}`;

            // Upload to R2
            if (!videoBuffer) {
                return NextResponse.json({ state: 'error', error: 'Unable to resolve generated video data' });
            }

            const url = await uploadFile(videoBuffer, storageKey, 'video/mp4');
            console.log('[Veo Status][R2 Upload]', {
                workflowId: resolvedWorkflowId,
                nodeId: nodeId || 'generated',
                storageKey,
                url,
            });

            return NextResponse.json({
                state: 'done',
                done: true,
                response: { url, storageKey },
            });
        }

        return NextResponse.json({ state: 'processing', done: false });

    } catch (error: any) {
        console.error('Error in veo status route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
