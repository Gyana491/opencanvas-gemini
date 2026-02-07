"use client"

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, NodeProps, useUpdateNodeInternals, useReactFlow, useEdges } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Video, Loader2, AlertCircle, Download } from 'lucide-react'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoModelNode } from './video-model-node'
import { resolveImageInput } from '@/lib/utils/image-processing'
import { downloadMedia } from '@/lib/utils/download'
import { uploadToR2 } from '@/lib/utils/upload'

const inputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspectRatio: z.enum(['16:9', '9:16']).optional(),
    resolution: z.enum(['720p', '1080p', '4k']).optional(),
    durationSeconds: z.union([
        z.enum(['4', '6', '8']),
        z.number().transform(n => String(n))
    ]).optional(),
});

export const Veo3Node = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const [isRunning, setIsRunning] = useState(false);

    const getInitialVideo = () => {
        return (data?.output as string) || ''
    }

    const [output, setOutput] = useState<string>(getInitialVideo());
    const [error, setError] = useState<string>('');
    const [progress, setProgress] = useState<string>('');

    // Get React Flow instance to access current node/edge state
    const { getNodes } = useReactFlow();
    const edges = useEdges();

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const aspectRatio = (data?.aspectRatio as string) || '16:9';
    const resolution = (data?.resolution as string) || '720p';
    const durationSeconds = String(data?.durationSeconds || '8');
    const imageInputCount = (data?.imageInputCount as number) || 0;

    const updateNodeInternals = useUpdateNodeInternals();

    // Helper function to get fresh data from connected nodes
    const getFreshConnectedData = () => {
        const nodes = getNodes();
        const incomingEdges = edges.filter(edge => edge.target === id);

        let freshPrompt = '';
        const freshImages: { [key: string]: string } = {};
        let freshVideo = '';

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
            // Get first frame image
            else if (targetHandle === 'image') {
                if (sourceNode.type === 'imageUpload') {
                    freshImages['image'] = (sourceNode.data?.imageUrl as string) || '';
                } else if (sourceNode.type === 'nanoBanana' || sourceNode.type === 'nanoBananaPro' || sourceNode.type === 'imagen') {
                    freshImages['image'] = (sourceNode.data?.output as string) || '';
                }
            }
            // Get reference images
            else if (targetHandle?.startsWith('ref_image_')) {
                const imageKey = targetHandle;
                if (sourceNode.type === 'imageUpload') {
                    freshImages[imageKey] = (sourceNode.data?.imageUrl as string) || '';
                } else if (sourceNode.type === 'nanoBanana' || sourceNode.type === 'nanoBananaPro' || sourceNode.type === 'imagen') {
                    freshImages[imageKey] = (sourceNode.data?.output as string) || '';
                }
            }
            // Get video for extension
            else if (targetHandle === 'video') {
                if (sourceNode.type === 'veo3') {
                    freshVideo = (sourceNode.data?.output as string) || '';
                }
            }
        });

        return { freshPrompt, freshImages, freshVideo };
    };

    // Notify React Flow when handles change
    useEffect(() => {
        updateNodeInternals(id);
    }, [imageInputCount, id, updateNodeInternals]);

    // Update video URL when data changes (e.g. on load)
    useEffect(() => {
        if (!isRunning) {
            setOutput(getInitialVideo())
        }
    }, [data?.output])

    const handleAddInput = () => {
        if (data?.onUpdateNodeData) {
            const newCount = imageInputCount + 1;
            if (newCount <= 3) { // Max 3 reference images
                (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                    imageInputCount: newCount
                });
            }
        }
    };

    const inputs = [
        { id: 'prompt', label: 'Prompt', type: 'text', required: true },
        { id: 'image', label: 'First Frame', type: 'image' },
        ...Array.from({ length: imageInputCount }).map((_, i) => ({
            id: `ref_image_${i}`,
            label: `Ref ${i + 1}`,
            type: 'image'
        })),
        { id: 'video', label: 'Extend Video', type: 'video' }
    ] as any[];

    const outputs = (data?.outputs || [
        { id: 'output', label: 'Video', type: 'video' }
    ]) as any[];

    const pollOperationStatus = async (operationName: string): Promise<string> => {
        const maxAttempts = 120; // 10 minutes with 5 second intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
            // Call server-side status endpoint
            const response = await fetch(
                `/api/providers/google/veo-3.1-generate-preview/status?name=${encodeURIComponent(operationName)}&workflowId=${encodeURIComponent(workflowId)}&nodeId=${encodeURIComponent(id)}`,
                {
                    method: 'GET',
                }
            );

            if (!response.ok) {
                // If status check fails, we might want to retry or throw
                // For now, let's throw but we could implement retry logic for network blips
                throw new Error(`Failed to check status: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.state === 'done') {
                if (result.error) {
                    throw new Error(result.error || 'Video generation failed');
                }

                if (!result.url) {
                    throw new Error('Completed but no video URL returned');
                }

                return result.url;
            } else if (result.state === 'error') {
                throw new Error(result.error || 'Video generation failed');
            }

            // Update progress
            // result.state === 'processing'
            setProgress(`Processing... (${attempts * 5}s elapsed)`);

            // Wait 5 seconds before next poll
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }

        throw new Error('Video generation timed out');
    };

    const handleRun = async () => {
        try {
            setIsRunning(true);
            setError('');
            setProgress('Initializing...');

            // No client-side AP key check needed

            // Get FRESH data from connected nodes
            const { freshPrompt, freshImages, freshVideo } = getFreshConnectedData();
            const finalPrompt = freshPrompt || prompt;

            console.log('[Fresh Data]', { freshPrompt, freshImages, freshVideo, finalPrompt });

            inputSchema.parse({
                prompt: finalPrompt,
                aspectRatio,
                resolution,
                durationSeconds
            });

            setProgress('Preparing request...');

            // Build the request body
            const requestBody: any = {
                instances: [{
                    prompt: finalPrompt
                }],
                parameters: {
                    aspectRatio: aspectRatio,
                    // resolution, durationSeconds handled by API if supported, or default
                }
            };

            // Add first frame image if connected
            if (freshImages['image']) {
                try {
                    const { mimeType, base64Data } = await resolveImageInput(freshImages['image']);
                    requestBody.instances[0].image = {
                        bytesBase64Encoded: base64Data,
                        mimeType: mimeType
                    };
                } catch (e) {
                    console.error('Failed to resolve first frame image', e);
                    throw new Error('Failed to load first frame image. Please check the input.');
                }
            }

            // Add reference images if connected (up to 3)
            const referenceImages = [];
            for (let i = 0; i < imageInputCount; i++) {
                const connectedImage = freshImages[`ref_image_${i}`];
                if (connectedImage) {
                    try {
                        const { mimeType, base64Data } = await resolveImageInput(connectedImage);
                        referenceImages.push({
                            bytesBase64Encoded: base64Data,
                            mimeType: mimeType,
                            referenceType: "asset"
                        });
                    } catch (e) {
                        console.error(`Failed to resolve ref image ${i}`, e);
                    }
                }
            }

            if (referenceImages.length > 0) {
                requestBody.parameters.referenceImages = referenceImages;
            }

            setProgress('Submitting request...');

            // Start video generation via Server-Side API
            const response = await fetch('/api/providers/google/veo-3.1-generate-preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed: ${response.statusText}`);
            }

            const result = await response.json();
            const operationName = result.name;

            if (!operationName) {
                throw new Error('No operation name in response');
            }

            setProgress('Generating video...');

            // Poll for completion (using server-side status endpoint)
            const videoUrl = await pollOperationStatus(operationName);

            setProgress('Finalizing...');
            setOutput(videoUrl);

            if (data?.onUpdateNodeData && typeof data.onUpdateNodeData === 'function') {
                (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                    output: videoUrl,
                    assetPath: videoUrl,
                });
            }

            setProgress('');

        } catch (err) {
            if (err instanceof z.ZodError) {
                setError(err.issues[0].message);
            } else {
                setError(err instanceof Error ? err.message : 'Failed to generate video');
            }
            setProgress('');
        } finally {
            setIsRunning(false);
        }
    };

    const handleDownload = () => {
        downloadMedia(output, `veo-${Date.now()}.mp4`);
    };

    return (
        <VideoModelNode
            id={id}
            selected={selected}
            title="Veo"
            icon={Video}
            iconClassName="bg-gradient-to-br from-violet-500 to-indigo-500"
            isRunning={isRunning}
            videoUrl={output}
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

Veo3Node.displayName = 'Veo3Node'

export const Veo3Properties = ({ node, onUpdateNode }: { node: any, onUpdateNode: (id: string, data: any) => void }) => {
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
