import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/r2';
import { nanoid } from 'nanoid';
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
        const { workflowId, nodeId, ...googleBody } = body;

        const ai = new GoogleGenAI({ apiKey });

        const promptText = "Generate an image of " + (googleBody.contents?.[0]?.parts?.[0]?.text || "");
        const otherParts = googleBody.contents?.[0]?.parts?.slice(1) || [];

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: [
                {
                    parts: [
                        { text: promptText },
                        ...otherParts
                    ]
                }
            ],
            config: googleBody.generationConfig
        });

        // Extract image data
        const parts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

        if (imagePart && imagePart.inlineData && imagePart.inlineData.mimeType && imagePart.inlineData.data) {
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
                originalResponse: response
            });
        }

        return NextResponse.json(response);
    } catch (error: any) {
        console.error('Error in gemini-3-pro-image-preview route:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
