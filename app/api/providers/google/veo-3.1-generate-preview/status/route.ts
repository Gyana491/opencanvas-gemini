import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/r2';
import { nanoid } from 'nanoid';

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

        // Check operation status
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

        if (result.done) {
            if (result.error) {
                return NextResponse.json({ state: 'error', error: result.error.message });
            }

            const videoUri = result.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
            if (!videoUri) {
                return NextResponse.json({ state: 'error', error: 'No video URI in response' });
            }

            // Download the video server-side
            const videoResponse = await fetch(videoUri, {
                headers: {
                    'x-goog-api-key': apiKey,
                },
            });

            if (!videoResponse.ok) {
                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
            }

            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
            const fileName = `veo_${Date.now()}_${nanoid()}.mp4`;

            const storageKey = workflowId
                ? `workflows/${workflowId}/${nodeId || 'generated'}/${fileName}`
                : `temp/${nanoid()}/${fileName}`;

            // Upload to R2
            const url = await uploadFile(videoBuffer, storageKey, 'video/mp4');

            return NextResponse.json({ state: 'done', url, videoUri }); // videoUri kept for reference if needed, but url is main
        }

        return NextResponse.json({ state: 'processing' });

    } catch (error: any) {
        console.error('Error in veo status route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
