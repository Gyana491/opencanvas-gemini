import { NextRequest, NextResponse } from 'next/server';
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
        const { workflowId, nodeId, ...googleBody } = body;

        // Forward the request to Google API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...googleBody,
                    contents: [{
                        parts: [
                            { text: "Generate an image of " + googleBody.contents[0].parts[0].text },
                            ...googleBody.contents[0].parts.slice(1)
                        ]
                    }]
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `Google API Error: ${response.statusText}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();

        // Extract image data
        const parts = data.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

        if (imagePart) {
            const mimeType = imagePart.inlineData.mimeType;
            const base64Data = imagePart.inlineData.data;
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = mimeType.split('/')[1] || 'png';
            const fileName = `nano_banana_pro_${Date.now()}_${nanoid()}.${ext}`;

            const storageKey = workflowId
                ? `workflows/${workflowId}/${nodeId || 'generated'}/${fileName}`
                : `temp/${nanoid()}/${fileName}`;

            const url = await uploadFile(buffer, storageKey, mimeType);

            return NextResponse.json({
                url,
                success: true,
                originalResponse: data
            });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in gemini-3-pro-image-preview route:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
