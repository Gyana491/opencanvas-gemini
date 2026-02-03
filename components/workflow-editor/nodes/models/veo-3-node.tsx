"use client"

import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Video, Loader2, AlertCircle, Download } from 'lucide-react'
import { getGoogleApiKey } from '@/lib/utils/api-keys'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const inputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspectRatio: z.enum(['16:9', '9:16']).optional(),
    resolution: z.enum(['720p', '1080p', '4k']).optional(),
    durationSeconds: z.enum(['4', '6', '8']).optional(),
});

export const Veo3Node = memo(({ data, selected, id }: NodeProps) => {
    const [isRunning, setIsRunning] = useState(false);
    const [output, setOutput] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [progress, setProgress] = useState<string>('');

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const aspectRatio = (data?.aspectRatio as string) || '16:9';
    const resolution = (data?.resolution as string) || '720p';
    const durationSeconds = (data?.durationSeconds as string) || '8';

    const inputs = (data?.inputs || [
        { id: 'prompt', label: 'Prompt', type: 'text', required: true },
    ]) as Array<{
        id: string
        label: string
        type: 'text' | 'image' | 'video'
        required?: boolean
    }>;

    const outputs = (data?.outputs || [
        { id: 'output', label: 'Video', type: 'video' }
    ]) as Array<{
        id: string
        label: string
        type: 'text' | 'image' | 'video'
    }>;

    const getHandleTop = (index: number, total: number) => {
        if (total <= 1) {
            return '50%'
        }
        const start = 30
        const end = 70
        const step = (end - start) / (total - 1)
        return `${start + index * step}%`
    }

    const getHandleClass = (kind: 'text' | 'image' | 'video') => {
        if (kind === 'video') return '!bg-violet-400 !border-violet-200'
        if (kind === 'image') return '!bg-emerald-400 !border-emerald-200'
        return '!bg-sky-400 !border-sky-200'
    }

    const getLabelClass = (kind: 'text' | 'image' | 'video') => {
        if (kind === 'video') return 'text-violet-300'
        if (kind === 'image') return 'text-emerald-300'
        return 'text-sky-300'
    }

    const pollOperationStatus = async (operationName: string, apiKey: string): Promise<string> => {
        const maxAttempts = 120; // 10 minutes with 5 second intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
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
                    throw new Error(result.error.message || 'Video generation failed');
                }

                const videoUri = result.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
                if (!videoUri) {
                    throw new Error('No video URI in response');
                }

                return videoUri;
            }

            // Update progress
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

            const apiKey = getGoogleApiKey();
            if (!apiKey) {
                throw new Error('Google AI API key not configured. Please add it in the sidebar.');
            }

            inputSchema.parse({
                prompt,
                aspectRatio,
                resolution,
                durationSeconds
            });

            setProgress('Submitting request...');

            // Start video generation
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning`,
                {
                    method: 'POST',
                    headers: {
                        'x-goog-api-key': apiKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        instances: [{
                            prompt: prompt
                        }],
                        parameters: {
                            aspectRatio: aspectRatio,
                            resolution: resolution,
                            durationSeconds: parseInt(durationSeconds)
                        }
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const result = await response.json();
            const operationName = result.name;

            if (!operationName) {
                throw new Error('No operation name in response');
            }

            setProgress('Generating video...');

            // Poll for completion
            const videoUri = await pollOperationStatus(operationName, apiKey);

            setProgress('Downloading video...');

            // Download the video
            const videoResponse = await fetch(videoUri, {
                headers: {
                    'x-goog-api-key': apiKey,
                },
            });

            if (!videoResponse.ok) {
                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
            }

            const videoBlob = await videoResponse.blob();
            const videoUrl = URL.createObjectURL(videoBlob);

            setOutput(videoUrl);
            setProgress('');

            if (data?.onOutputChange && typeof data.onOutputChange === 'function') {
                (data.onOutputChange as (id: string, output: string) => void)(id, videoUrl);
            }
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
        if (!output) return;
        const link = document.createElement('a');
        link.href = output;
        link.download = `veo-3-${Date.now()}.mp4`;
        link.click();
    };

    const hasOutput = !!output || !!error;

    const cardStyle = hasOutput
        ? `relative min-w-[320px] bg-card border-2 transition-all ${selected ? 'border-primary shadow-lg' : 'border-border'}`
        : `relative min-w-[200px] bg-background/50 border-2 border-dashed transition-all ${selected ? 'border-primary bg-background' : 'border-border/50'}`;

    return (
        <Card className={cardStyle}>
            <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                            <Video className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="font-semibold text-sm">Veo 3</h3>
                    </div>
                </div>

                <Button
                    onClick={handleRun}
                    disabled={isRunning}
                    className="w-full mb-1"
                    size="sm"
                    variant={hasOutput ? "default" : "secondary"}
                >
                    {isRunning ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                        </>
                    ) : (
                        'Generate Video'
                    )}
                </Button>

                {progress && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-600 my-2">
                        {progress}
                    </div>
                )}

                {error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 my-2 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {output && (
                    <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                                Generated Video ({resolution}, {durationSeconds}s)
                            </Label>
                            <Button
                                onClick={handleDownload}
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2"
                            >
                                <Download className="w-3 h-3 mr-1" />
                                Download
                            </Button>
                        </div>
                        <div className="relative rounded overflow-hidden bg-muted">
                            <video
                                src={output}
                                controls
                                className="w-full h-auto"
                            >
                                Your browser does not support the video tag.
                            </video>
                        </div>
                    </div>
                )}
            </div>

            {inputs.map((input, index) => (
                <div
                    key={`${input.id}-label`}
                    className={`absolute left-[-84px] flex items-center gap-2 text-xs -translate-y-1/2 ${getLabelClass(input.type as any)} ${!hasOutput && !selected ? 'opacity-50' : 'opacity-100'}`}
                    style={{ top: getHandleTop(index, inputs.length) }}
                >
                    <span>{input.label}{input.required ? '*' : ''}</span>
                </div>
            ))}
            {outputs.map((output, index) => (
                <div
                    key={`${output.id}-label`}
                    className={`absolute right-[-64px] flex items-center gap-2 text-xs -translate-y-1/2 ${getLabelClass(output.type as any)} ${!hasOutput && !selected ? 'opacity-50' : 'opacity-100'}`}
                    style={{ top: getHandleTop(index, outputs.length) }}
                >
                    <span>{output.label}</span>
                </div>
            ))}

            {inputs.map((input, index) => (
                <Handle
                    key={input.id}
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    className={`!w-3 !h-3 !border-2 ${getHandleClass(input.type as any)}`}
                    style={{ top: getHandleTop(index, inputs.length) }}
                />
            ))}

            {outputs.map((output, index) => (
                <Handle
                    key={output.id}
                    type="source"
                    position={Position.Right}
                    id={output.id}
                    className={`!w-3 !h-3 !border-2 ${getHandleClass(output.type as any)}`}
                    style={{ top: getHandleTop(index, outputs.length) }}
                />
            ))}
        </Card>
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
                        <SelectItem value="4K">4K (3840x2160)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="durationSeconds" className="text-xs font-semibold">Duration</Label>
                <Select
                    value={String(node.data.durationSeconds || 4)}
                    onValueChange={(value) => handleDataChange('durationSeconds', parseInt(value))}
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
