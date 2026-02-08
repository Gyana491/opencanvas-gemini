"use client"

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { NodeProps, useUpdateNodeInternals, useReactFlow, useEdges } from '@xyflow/react'
import { Label } from '@/components/ui/label'
import { Video } from 'lucide-react'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoModelNode } from './video-model-node'
import { resolveImageInput } from '@/lib/utils/image-processing'
import { downloadMedia } from '@/lib/utils/download'

const inputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspectRatio: z.enum(['16:9', '9:16']).optional(),
    resolution: z.enum(['720p', '1080p', '4k']).optional(),
    durationSeconds: z.union([
        z.enum(['4', '6', '8']),
        z.number().transform(n => String(n))
    ]).optional(),
});

const getStringField = (value: unknown): string => typeof value === 'string' ? value : '';

const getPromptFromSourceNode = (sourceNode: any): string => {
    if (sourceNode?.type === 'textInput') {
        return getStringField(sourceNode?.data?.text);
    }

    return (
        getStringField(sourceNode?.data?.output) ||
        getStringField(sourceNode?.data?.prompt) ||
        getStringField(sourceNode?.data?.connectedPrompt)
    );
};

const getImageFromSourceNode = (sourceNode: any): string => {
    if (sourceNode?.type === 'imageUpload') {
        return getStringField(sourceNode?.data?.imageUrl);
    }

    return (
        getStringField(sourceNode?.data?.output) ||
        getStringField(sourceNode?.data?.imageUrl) ||
        getStringField(sourceNode?.data?.assetPath) ||
        getStringField(sourceNode?.data?.connectedImage)
    );
};

const getVideoFromSourceNode = (sourceNode: any): string => {
    return (
        getStringField(sourceNode?.data?.output) ||
        getStringField(sourceNode?.data?.videoUrl) ||
        getStringField(sourceNode?.data?.assetPath)
    );
};

const resolveVideoInput = async (input: string): Promise<{ mimeType: string, base64Data: string }> => {
    if (!input) {
        throw new Error('Input video string is empty');
    }

    const dataUrlMatch = input.match(/^data:(video\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (dataUrlMatch) {
        return {
            mimeType: dataUrlMatch[1],
            base64Data: dataUrlMatch[2]
        };
    }

    const response = await fetch(input);
    if (!response.ok) {
        throw new Error(`Failed to fetch video from URL: ${input}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type || 'video/mp4';

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            if (!result) {
                reject(new Error('Failed to convert video to base64'));
                return;
            }

            const base64Data = result.split(',')[1];
            if (!base64Data) {
                reject(new Error('Failed to parse video base64 payload'));
                return;
            }

            resolve({
                mimeType,
                base64Data
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const Veo31GeneratePreviewNode = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const [isRunning, setIsRunning] = useState(false);
    const { getNodes } = useReactFlow();
    const edges = useEdges();

    const getInitialVideo = () => {
        return (data?.output as string) || (data?.videoUrl as string) || ''
    }

    const [videoUrl, setVideoUrl] = useState<string>(getInitialVideo());
    const [error, setError] = useState<string>('');
    const [progress, setProgress] = useState<string>('');

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const imageInputCount = (data?.imageInputCount as number) ?? 0;

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
            else if (targetHandle?.startsWith('image_')) {
                const imageKey = targetHandle;
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

    // Update video URL when data changes (e.g. on load)
    useEffect(() => {
        if (!isRunning) {
            setVideoUrl(getInitialVideo())
        }
    }, [data?.output, data?.videoUrl])

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
        { id: 'output', label: 'Video', type: 'video' }
    ]) as any[];

    const pollStatus = async (operationName: string) => {
        const maxAttempts = 60; // 1 minute timeout (assuming 1s interval)
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const response = await fetch(`/api/providers/google/veo-3.1-generate-preview/status?name=${encodeURIComponent(operationName)}`);

                if (!response.ok) {
                    throw new Error('Failed to check status');
                }

                const data = await response.json();

                if (data.done) {
                    if (data.error) {
                        throw new Error(data.error.message || 'Video generation failed');
                    }
                    return data.response; // Should contain the video URI
                }

                setProgress('Processing...');
                await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
                attempts++;
            } catch (error) {
                console.error('Polling error:', error);
                throw error;
            }
        }
        throw new Error('Timeout waiting for video generation');
    };

    const handleRun = async () => {
        try {
            setIsRunning(true);
            setError('');
            setProgress('Starting...');

            // Get FRESH data from connected nodes
            const { freshPrompt, freshImages } = getFreshConnectedData();
            const finalPrompt = freshPrompt || prompt;

            console.log('[Veo Fresh Data]', { freshPrompt, freshImages, finalPrompt });

            if (!finalPrompt) {
                throw new Error('Prompt is required');
            }

            // Prepare request body
            const requestBody: any = {
                prompt: finalPrompt,
                workflowId,
                nodeId: id
            };

            // Handle reference images if any
            if (Object.keys(freshImages).length > 0) {
                const imageParts = [];
                for (let i = 0; i < imageInputCount; i++) {
                    const connectedImage = freshImages[`image_${i}`];
                    if (connectedImage) {
                        try {
                            const { mimeType, base64Data } = await resolveImageInput(connectedImage);
                            imageParts.push({
                                inlineData: {
                                    mimeType: mimeType,
                                    data: base64Data
                                }
                            });
                        } catch (e) {
                            console.error(`Failed to resolve ref image ${i}`, e);
                            throw new Error(`Failed to load reference image ${i + 1}. Please check the connected input.`);
                        }
                    }
                }

                if (imageParts.length > 0) {
                    requestBody.images = imageParts;
                }
            }

            setProgress('Submitting request...');

            // Call server-side API to start generation
            const response = await fetch('/api/providers/google/veo-3.1-generate-preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to start video generation');
            }

            const responseData = await response.json();

            if (responseData.success && responseData.operationName) {
                // Start polling
                const result = await pollStatus(responseData.operationName);

                if (result && result.url) {
                    const assetPathStr = result.url;
                    setVideoUrl(assetPathStr);

                    if (data?.onUpdateNodeData && typeof data.onUpdateNodeData === 'function') {
                        (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                            output: assetPathStr,
                            assetPath: assetPathStr,
                            videoUrl: assetPathStr
                        });
                    }
                } else {
                    throw new Error('No video URL returned after completion');
                }

            } else {
                throw new Error('No operation name returned');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate video');
        } finally {
            setIsRunning(false);
            setProgress('');
        }
    };

    const handleDownload = () => {
        downloadMedia(videoUrl, `veo-3.1-generate-preview-${Date.now()}.mp4`);
    };

    return (
        <VideoModelNode
            id={id}
            selected={selected}
            title="veo-3.1-generate-preview"
            icon={Video}
            iconClassName="bg-gradient-to-br from-violet-500 to-indigo-500"
            isRunning={isRunning}
            videoUrl={videoUrl}
            error={error}
            progress={progress}
            onRun={handleRun}
            onDownload={handleDownload}
            onAddInput={imageInputCount < 3 ? handleAddInput : undefined}
            inputs={inputs}
            outputs={outputs}
        />
    )
})

Veo31GeneratePreviewNode.displayName = 'Veo31GeneratePreviewNode'

export const Veo31GeneratePreviewProperties = ({ node, onUpdateNode }: { node: any, onUpdateNode: (id: string, data: any) => void }) => {
    const handleDataChange = (field: string, value: any) => {
        onUpdateNode(node.id, { [field]: value })
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="aspectRatio" className="text-xs font-semibold">Aspect Ratio</Label>
                <Select
                    value={node.data.aspectRatio || '16:9'}
                    onValueChange={(value) => handleDataChange('aspectRatio', value)}
                >
                    <SelectTrigger id="aspectRatio" className="h-8 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="resolution" className="text-xs font-semibold">Resolution</Label>
                <Select
                    value={node.data.resolution || '720p'}
                    onValueChange={(value) => handleDataChange('resolution', value)}
                >
                    <SelectTrigger id="resolution" className="h-8 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="720p">720p (1280x720)</SelectItem>
                        <SelectItem value="1080p">1080p (1920x1080)</SelectItem>
                        <SelectItem value="4k">4K (3840x2160)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="durationSeconds" className="text-xs font-semibold">Duration</Label>
                <Select
                    value={String(node.data.durationSeconds || '8')}
                    onValueChange={(value) => handleDataChange('durationSeconds', value)}
                >
                    <SelectTrigger id="durationSeconds" className="h-8 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="4">4 seconds</SelectItem>
                        <SelectItem value="6">6 seconds</SelectItem>
                        <SelectItem value="8">8 seconds</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
