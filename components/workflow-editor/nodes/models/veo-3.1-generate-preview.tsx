"use client"

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { NodeProps, useUpdateNodeInternals, useReactFlow, useEdges } from '@xyflow/react'
import { Label } from '@/components/ui/label'
import { Video } from 'lucide-react'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VideoModelNode } from './video-model-node'
import { downloadMedia } from '@/lib/utils/download'
import { uploadToR2 } from '@/lib/utils/upload'
import { MODELS } from '@/data/models';

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
const extensionFromMimeType = (mimeType: string): string => {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('heic')) return 'heic';
    if (normalized.includes('heif')) return 'heif';
    return 'png';
};
const getCallableOutput = (value: unknown): string => {
    if (typeof value !== 'function') return '';
    try {
        const result = value();
        return typeof result === 'string' ? result : '';
    } catch {
        return '';
    }
};

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
        return (
            getStringField(sourceNode?.data?.imageUrl) ||
            getStringField(sourceNode?.data?.assetPath)
        );
    }

    return (
        getStringField(sourceNode?.data?.output) ||
        getStringField(sourceNode?.data?.imageOutput) ||
        getStringField(sourceNode?.data?.maskOutput) ||
        getStringField(sourceNode?.data?.imageUrl) ||
        getStringField(sourceNode?.data?.assetPath) ||
        getStringField(sourceNode?.data?.connectedImage) ||
        getCallableOutput(sourceNode?.data?.getOutput) ||
        getCallableOutput(sourceNode?.data?.getMaskOutput)
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
    const aspectRatio = (data?.aspectRatio as string) || '16:9';
    const resolution = (data?.resolution as string) || '720p';
    const durationSeconds = String(data?.durationSeconds || '8');
    const imageInputCount = (data?.imageInputCount as number) ?? 0;

    const updateNodeInternals = useUpdateNodeInternals();

    useEffect(() => {
        const incomingEdges = edges.filter(edge => edge.target === id);
        console.log('[Veo Node][Handle Snapshot]', {
            nodeId: id,
            imageInputCount,
            incomingEdges: incomingEdges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
            })),
            connectedPrompt: data?.connectedPrompt || '',
            connectedFirstFrame: data?.connectedFirstFrame || '',
            connectedLastFrame: data?.connectedLastFrame || '',
            connectedVideo: data?.connectedVideo || '',
            connectedRefImages: Array.from({ length: imageInputCount }).map((_, i) => ({
                key: `connectedRefImage_${i}`,
                value: data?.[`connectedRefImage_${i}`] || ''
            })),
        });
    }, [
        id,
        edges,
        imageInputCount,
        data?.connectedPrompt,
        data?.connectedFirstFrame,
        data?.connectedLastFrame,
        data?.connectedVideo,
        data
    ]);

    // Helper function to get fresh data from connected nodes
    const getFreshConnectedData = () => {
        const nodes = getNodes();
        const incomingEdges = edges.filter(edge => edge.target === id);

        let freshPrompt = '';
        let freshFirstFrame = '';
        let freshLastFrame = '';
        let hasFirstFrameEdge = false;
        let hasLastFrameEdge = false;
        const freshImages: { [key: string]: string } = {};

        incomingEdges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            const targetHandle = edge.targetHandle;

            // Get prompt from text input
            if (targetHandle === 'prompt') {
                freshPrompt = getPromptFromSourceNode(sourceNode);
            }
            else if (targetHandle === 'image' || targetHandle === 'firstFrame') {
                hasFirstFrameEdge = true;
                freshFirstFrame = getImageFromSourceNode(sourceNode);
            }
            else if (targetHandle === 'lastFrame') {
                hasLastFrameEdge = true;
                freshLastFrame = getImageFromSourceNode(sourceNode);
            }
            // Get images from image handles
            else if (targetHandle?.startsWith('ref_image_') || targetHandle?.startsWith('image_')) {
                const imageKey = targetHandle;
                freshImages[imageKey] = getImageFromSourceNode(sourceNode);
            }
        });

        if (!freshPrompt) {
            freshPrompt = getStringField(data?.connectedPrompt) || getStringField(data?.prompt);
        }

        if (hasFirstFrameEdge && !freshFirstFrame) {
            freshFirstFrame =
                getStringField(data?.connectedFirstFrame) ||
                getStringField(data?.connectedImage);
        }

        if (hasLastFrameEdge && !freshLastFrame) {
            freshLastFrame = getStringField(data?.connectedLastFrame);
        }

        for (let i = 0; i < imageInputCount; i++) {
            const key = `ref_image_${i}`;
            if (!freshImages[key]) {
                freshImages[key] = getStringField(data?.[`connectedRefImage_${i}`]);
            }
        }

        console.log('[Veo Node][Fresh Connected Data]', {
            nodeId: id,
            incomingEdges: incomingEdges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
            })),
            freshPrompt,
            freshFirstFrame,
            freshLastFrame,
            hasFirstFrameEdge,
            hasLastFrameEdge,
            freshImages,
        });

        return { freshPrompt, freshFirstFrame, freshLastFrame, hasFirstFrameEdge, hasLastFrameEdge, freshImages };
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
        { id: 'image', label: 'First Frame', type: 'image' },
        { id: 'lastFrame', label: 'Last Frame', type: 'image' },
        ...Array.from({ length: imageInputCount }).map((_, i) => ({
            id: `ref_image_${i}`,
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
                const params = new URLSearchParams({
                    name: operationName,
                });
                if (workflowId) {
                    params.set('workflowId', workflowId);
                }
                if (id) {
                    params.set('nodeId', id);
                }

                const response = await fetch(`/api/providers/google/veo-3.1-generate-preview/status?${params.toString()}`);

                if (!response.ok) {
                    throw new Error('Failed to check status');
                }

                const data = await response.json();

                if (data.done) {
                    if (data.error?.message) {
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
            const { freshPrompt, freshFirstFrame, freshLastFrame, hasFirstFrameEdge, hasLastFrameEdge, freshImages } = getFreshConnectedData();
            const finalPrompt = freshPrompt || prompt;

            console.log('[Veo Fresh Data]', { freshPrompt, freshFirstFrame, freshLastFrame, freshImages, finalPrompt });

            if (!finalPrompt) {
                throw new Error('Prompt is required');
            }

            // Prepare request body
            const requestBody: any = {
                prompt: finalPrompt,
                workflowId,
                nodeId: id,
                parameters: {
                    aspectRatio,
                    resolution,
                    durationSeconds,
                },
            };

            const makeServerReachableImageUrl = async (inputUrl: string, label: string) => {
                console.log('[Veo Node][Normalize Image Input]', {
                    nodeId: id,
                    label,
                    inputUrl,
                    isBlob: inputUrl.startsWith('blob:'),
                });

                if (!inputUrl.startsWith('blob:')) {
                    return inputUrl;
                }

                if (!workflowId || workflowId === 'new') {
                    throw new Error('First/last frame uses local blob URL, but workflow ID is missing. Save the workflow and retry.');
                }

                const blobResponse = await fetch(inputUrl);
                if (!blobResponse.ok) {
                    throw new Error(`Failed to read local ${label} image.`);
                }

                const blob = await blobResponse.blob();
                const mimeType = blob.type || 'image/png';
                const extension = extensionFromMimeType(mimeType);
                const fileName = `veo_${label}_${Date.now()}.${extension}`;

                const uploaded = await uploadToR2(blob, workflowId, id, fileName);
                if (!uploaded.success || !uploaded.url) {
                    throw new Error(uploaded.error || `Failed to upload ${label} image to storage.`);
                }

                console.log('[Veo Node][Normalize Image Input][Uploaded]', {
                    nodeId: id,
                    label,
                    uploadedUrl: uploaded.url,
                });

                return uploaded.url;
            };

            if (freshFirstFrame) {
                requestBody.imageUrl = await makeServerReachableImageUrl(freshFirstFrame, 'first-frame');
            }

            if (freshLastFrame) {
                if (!requestBody.imageUrl) {
                    throw new Error('Last frame requires a first frame input.');
                }
                requestBody.lastFrameUrl = await makeServerReachableImageUrl(freshLastFrame, 'last-frame');
            }
            if (hasLastFrameEdge && !hasFirstFrameEdge) {
                throw new Error('Last frame requires first frame input.');
            }
            if (hasFirstFrameEdge && !requestBody.imageUrl) {
                throw new Error('First frame input is connected but has no image data yet. Run/generate the source image first.');
            }

            // Handle reference images if any
            if (Object.keys(freshImages).length > 0) {
                const referenceImageUrls = [];
                for (let i = 0; i < imageInputCount; i++) {
                    const connectedImage = freshImages[`ref_image_${i}`] || freshImages[`image_${i}`];
                    if (connectedImage) {
                        const resolvableUrl = await makeServerReachableImageUrl(connectedImage, `reference-${i + 1}`);
                        referenceImageUrls.push(resolvableUrl);
                    }
                }

                if (referenceImageUrls.length > 0) {
                    requestBody.referenceImageUrls = referenceImageUrls;
                    requestBody.parameters.durationSeconds = '8';
                }
            }

            // Interpolation (first + last frame) is expected to be 8s.
            if (
                requestBody.imageUrl &&
                requestBody.lastFrameUrl &&
                requestBody.parameters?.durationSeconds &&
                requestBody.parameters.durationSeconds !== '8'
            ) {
                requestBody.parameters.durationSeconds = '8';
            }

            // Veo 3.1 requires 8s duration for 1080p/4k output.
            if (
                requestBody.parameters.resolution &&
                ['1080p', '4k'].includes(requestBody.parameters.resolution) &&
                requestBody.parameters.durationSeconds !== '8'
            ) {
                requestBody.parameters.durationSeconds = '8';
            }

            if (!requestBody.parameters.aspectRatio) {
                delete requestBody.parameters.aspectRatio;
            }
            if (!requestBody.parameters.resolution) {
                delete requestBody.parameters.resolution;
            }
            if (!requestBody.parameters.durationSeconds) {
                delete requestBody.parameters.durationSeconds;
            }
            if (Object.keys(requestBody.parameters).length === 0) {
                delete requestBody.parameters;
            }
            if (!requestBody.imageUrl) {
                delete requestBody.imageUrl;
            }
            if (!requestBody.lastFrameUrl) {
                delete requestBody.lastFrameUrl;
            }

            console.log('[Veo Node][Request Payload]', {
                nodeId: id,
                requestBody: {
                    ...requestBody,
                    imageUrl: requestBody.imageUrl || '',
                    lastFrameUrl: requestBody.lastFrameUrl || '',
                    referenceImageUrls: requestBody.referenceImageUrls || [],
                }
            });

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
            const operationName = responseData.operationName || responseData.operation?.name || responseData.name;

            if (operationName) {
                // Start polling
                const result = await pollStatus(operationName);

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


    const model = MODELS.find(m => m.id === 'veo-3.1-generate-preview');

    return (
        <VideoModelNode
            id={id}
            selected={selected}
            title={model?.title || "Veo 3.1"}
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
