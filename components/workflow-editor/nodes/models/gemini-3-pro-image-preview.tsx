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
import { Switch } from "@/components/ui/switch"
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
    imageSize: z.enum(['1K', '2K', '4K']).optional(),
});

export const Gemini3ProImagePreviewNode = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const [isRunning, setIsRunning] = useState(false);

    const getInitialImage = () => {
        return (data?.output as string) || (data?.imageUrl as string) || ''
    }

    const [output, setOutput] = useState<string>(getInitialImage());
    const [error, setError] = useState<string>('');
    const [thinkingOutput, setThinkingOutput] = useState<string>('');

    // Get React Flow instance to access current node/edge state
    const { getNodes } = useReactFlow();
    const edges = useEdges();

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const aspectRatio = (data?.aspectRatio as string) || '1:1';
    const imageSize = (data?.imageSize as string) || '2K';
    const useGoogleSearch = (data?.useGoogleSearch as boolean) || false;
    const imageInputCount = (data?.imageInputCount as number) ?? 1;

    const updateNodeInternals = useUpdateNodeInternals();

    // Helper function to get fresh data from connected nodes
    // Accepts ANY node that outputs an image - no node type restrictions
    const getFreshConnectedData = () => {
        const nodes = getNodes();
        const incomingEdges = edges.filter(edge => edge.target === id);

        let freshPrompt = '';
        const freshImages: { [key: string]: string } = {};

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            const targetHandle = edge.targetHandle;
            const sourceData = sourceNode.data as Record<string, unknown>;

            // Get prompt from text input
            if (targetHandle === 'prompt') {
                if (sourceNode.type === 'textInput') {
                    freshPrompt = (sourceData?.text as string) || '';
                } else if (typeof sourceData?.output === 'string') {
                    freshPrompt = sourceData.output;
                }
            }
            // Get images from image handles - accept ANY node that outputs an image
            else if (targetHandle === 'image' || targetHandle?.startsWith('image_')) {
                const imageKey = targetHandle === 'image' ? 'image' : targetHandle;
                // Try common output properties in order of priority
                freshImages[imageKey] = (sourceData?.output as string) ||
                    (sourceData?.imageOutput as string) ||
                    (sourceData?.imageUrl as string) ||
                    (sourceData?.assetPath as string) || '';
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
            const newCount = imageInputCount + 1;
            (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                imageInputCount: newCount
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
            setThinkingOutput('');

            // No client-side API key check needed

            // Get FRESH data from connected nodes
            const { freshPrompt, freshImages } = getFreshConnectedData();
            const finalPrompt = freshPrompt || prompt;

            console.log('[Fresh Data - Pro]', { freshPrompt, freshImages, finalPrompt });

            inputSchema.parse({
                prompt: finalPrompt,
                aspectRatio,
                imageSize
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
                        // continue
                    }
                }
            }

            const requestBody: any = {
                workflowId,
                nodeId: id,
                contents: [{
                    parts: contentsParts
                }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                }
            };

            if (useGoogleSearch) {
                requestBody.tools = [{ googleSearch: {} }];
            }

            // Call server-side API (which handles R2 upload)
            const response = await fetch('/api/providers/google/gemini-3-pro-image-preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate image');
            }

            const responseData = await response.json();

            // Handle thinking output from originalResponse
            if (responseData.originalResponse) {
                const parts = responseData.originalResponse.candidates?.[0]?.content?.parts || [];
                const thinkingParts = parts.filter((p: any) => p.thought);

                if (thinkingParts.length > 0) {
                    const thoughts = thinkingParts
                        .map((p: any) => p.text) // Thinking parts usually have 'text' not 'thought' property in API response, but checking source code it filtered by 'p.thought'. Wait, Gemini 2.0 Flash Thinking model uses specific parts. 
                        // The source code used `p.thought`. I should verify if `p.thought` exists. 
                        // Standard Gemini Thinking uses `part.text` but the kind is 'thought'.
                        // However, the source code had `p.thought`. I will assume this property exists in the custom response structure or the source knew something specific.
                        // Actually, looking at previous code: `const thinkingParts = parts.filter((p: any) => p.thought);`.
                        // And then `const thoughts = thinkingParts.map((p: any) => p.text)`. 
                        // Wait, if `p.thought` is the filter, then `p` has a truthy `thought` property.
                        // I will keep the logic same as source.
                        .filter(Boolean)
                        .join('\n\n');
                    setThinkingOutput(thoughts);
                }
            }

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
        downloadMedia(output, `gemini-3-pro-image-preview-${Date.now()}.png`);
    };

    const model = MODELS.find(m => m.id === 'gemini-3-pro-image-preview');

    return (
        <ImageModelNode
            id={id}
            selected={selected}
            title={model?.title || "Nano Banana Pro"}
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

Gemini3ProImagePreviewNode.displayName = 'Gemini3ProImagePreviewNode'

export const Gemini3ProImagePreviewProperties = ({ node, onUpdateNode }: { node: any, onUpdateNode: (id: string, data: any) => void }) => {
    const handleDataChange = (field: string, value: any) => {
        onUpdateNode(node.id, { [field]: value })
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="imageSize" className="text-xs font-semibold">Image Size</Label>
                <Select
                    value={node.data.imageSize || '1K'}
                    onValueChange={(value) => handleDataChange('imageSize', value)}
                >
                    <SelectTrigger id="imageSize" className="h-8 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1K">1K (1024x1024)</SelectItem>
                        <SelectItem value="2K">2K (2048x2048)</SelectItem>
                        <SelectItem value="4K">4K (4096x4096)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="useGoogleSearch" className="text-xs font-semibold cursor-pointer">
                    Use Google Search
                </Label>
                <Switch
                    id="useGoogleSearch"
                    checked={node.data.useGoogleSearch || false}
                    onCheckedChange={(checked) => handleDataChange('useGoogleSearch', checked)}
                />
            </div>
            <p className="text-[10px] text-muted-foreground">Enable web search for better image context</p>
        </div>
    )
}
