"use client"

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, NodeProps, useUpdateNodeInternals, useReactFlow, useEdges } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Image as ImageIcon, Loader2, AlertCircle, Download } from 'lucide-react'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageModelNode } from './image-model-node'
import { resolveImageInput } from '@/lib/utils/image-processing'
import { downloadMedia } from '@/lib/utils/download'
import { uploadToR2 } from '@/lib/utils/upload'
import { MODELS } from '@/data/models';
import { PROVIDERS } from '@/data/providers';

const googleProvider = PROVIDERS.find(p => p.id === 'google');
const inputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
});

export const Gemini25FlashImageNode = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const [isRunning, setIsRunning] = useState(false);

    const getInitialImage = () => {
        return (data?.output as string) || (data?.imageUrl as string) || ''
    }

    const [output, setOutput] = useState<string>(getInitialImage());
    const [error, setError] = useState<string>('');

    // Get React Flow instance to access current node/edge state
    const { getNodes } = useReactFlow();
    const edges = useEdges();

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const aspectRatio = (data?.aspectRatio as string) || '1:1';
    const imageInputCount = (data?.imageInputCount as number) ?? 1;

    const updateNodeInternals = useUpdateNodeInternals();

    // Helper function to get fresh data from connected nodes
    const getFreshConnectedData = () => {
        const nodes = getNodes();
        const incomingEdges = edges.filter(edge => edge.target === id);

        let freshPrompt = '';
        const freshImages: { [key: string]: string } = {};

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            const targetHandle = edge.targetHandle;

            // Get prompt from text input
            if (targetHandle === 'prompt') {
                if (sourceNode.type === 'textInput') {
                    freshPrompt = (sourceNode.data?.text as string) || '';
                }
            }
            // Get images from image handles
            else if (targetHandle === 'image' || targetHandle?.startsWith('image_')) {
                const imageKey = targetHandle === 'image' ? 'image' : targetHandle;
                if (sourceNode.type === 'imageUpload') {
                    freshImages[imageKey] = (sourceNode.data?.imageUrl as string) || '';
                } else if (sourceNode.type === 'gemini-2.5-flash-image' || sourceNode.type === 'gemini-3-pro-image-preview' || sourceNode.type === 'imagen-4.0-generate-001') {
                    freshImages[imageKey] = (sourceNode.data?.output as string) || '';
                }
            }
        });

        return { freshPrompt, freshImages };
    };

    // Notify React Flow when handles change
    useEffect(() => {
        updateNodeInternals(id);
    }, [imageInputCount, id, updateNodeInternals]);

    // Update image URL when data changes (e.g. on load)
    useEffect(() => {
        if (!isRunning) {
            setOutput(getInitialImage())
        }
    }, [data?.output, data?.imageUrl])

    const handleAddInput = () => {
        if (data?.onUpdateNodeData) {
            (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                imageInputCount: imageInputCount + 1
            });
        }
    };

    const inputs = [
        { id: 'prompt', label: 'Prompt', type: 'text', required: true },
        ...Array.from({ length: imageInputCount }).map((_, i) => ({
            id: `image_${i}`,
            label: `Ref Image ${i + 1}`,
            type: 'image'
        }))
    ] as any[];

    const outputs = (data?.outputs || [
        { id: 'output', label: 'Image', type: 'image' }
    ]) as any[];

    const handleRun = async () => {
        try {
            setIsRunning(true);
            setError('');

            // No client-side API key check needed

            // Get FRESH data from connected nodes
            const { freshPrompt, freshImages } = getFreshConnectedData();
            const finalPrompt = freshPrompt || prompt;

            console.log('[Fresh Data]', { freshPrompt, freshImages, finalPrompt });

            inputSchema.parse({
                prompt: finalPrompt,
                aspectRatio
            });

            const contentsParts: any[] = [{ text: finalPrompt }];

            // Handle multiple reference images if connected (using FRESH images)
            for (let i = 0; i < imageInputCount; i++) {
                const connectedImage = freshImages[`image_${i}`];
                if (connectedImage) {
                    try {
                        const { mimeType, base64Data } = await resolveImageInput(connectedImage);
                        contentsParts.push({
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        });
                    } catch (e) {
                        console.error(`Failed to resolve image input ${i}`, e);
                        // Could throw or skip
                    }
                }
            }

            // Call server-side API (which handles R2 upload)
            const response = await fetch('/api/providers/google/gemini-2.5-flash-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId,
                    nodeId: id,
                    contents: [{
                        parts: contentsParts
                    }],
                    generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                    }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate image');
            }

            const responseData = await response.json();

            if (responseData.success && responseData.url) {
                const assetPathStr = responseData.url;
                setOutput(assetPathStr);

                if (data?.onUpdateNodeData && typeof data.onUpdateNodeData === 'function') {
                    (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                        output: assetPathStr,
                        assetPath: assetPathStr,
                        imageUrl: assetPathStr
                    });
                }
            } else {
                if (responseData.error) {
                    throw new Error(responseData.error);
                }
                // If no URL but success (maybe just text?), handle accordingly
                // But for this node, we expect image URL
                throw new Error('No image URL returned from server');
            }
        } catch (err) {
            if (err instanceof z.ZodError) {
                setError(err.issues[0].message);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to generate image');
            }
        } finally {
            setIsRunning(false);
        }
    };

    const handleDownload = () => {
        downloadMedia(output, `gemini-2.5-flash-image-${Date.now()}.png`);
    };

    const model = MODELS.find(m => m.id === 'gemini-2.5-flash-image');

    return (
        <ImageModelNode
            id={id}
            selected={selected}
            title={model?.title || "Nano Banana"}
            icon={googleProvider?.logo || ImageIcon}
            iconClassName="bg-white"
            isRunning={isRunning}
            imageUrl={output}
            error={error}
            onRun={handleRun}
            onDownload={handleDownload}
            onAddInput={handleAddInput}
            inputs={inputs}
            outputs={outputs}
        />
    )
})

Gemini25FlashImageNode.displayName = 'Gemini25FlashImageNode'

export const Gemini25FlashImageProperties = ({ node, onUpdateNode }: { node: any, onUpdateNode: (id: string, data: any) => void }) => {
    const handleDataChange = (field: string, value: any) => {
        onUpdateNode(node.id, { [field]: value })
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="aspectRatio" className="text-xs font-semibold">Aspect Ratio</Label>
                <Select
                    value={node.data.aspectRatio || '1:1'}
                    onValueChange={(value) => handleDataChange('aspectRatio', value)}
                >
                    <SelectTrigger id="aspectRatio" className="h-8 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1:1">1:1 (Square)</SelectItem>
                        <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                        <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                        <SelectItem value="16:9">16:9 (Widescreen)</SelectItem>
                        <SelectItem value="3:2">3:2</SelectItem>
                        <SelectItem value="2:3">2:3</SelectItem>
                        <SelectItem value="16:10">16:10</SelectItem>
                        <SelectItem value="10:16">10:16</SelectItem>
                        <SelectItem value="21:9">21:9 (Ultrawide)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
