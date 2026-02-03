"use client"

import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Image as ImageIcon, Loader2, AlertCircle, Download } from 'lucide-react'
import { experimental_generateImage as generateImage } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { getGoogleApiKey } from '@/lib/utils/api-keys'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const inputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).optional(),
});

export const ImagenNode = memo(({ data, selected, id }: NodeProps) => {
    const [isRunning, setIsRunning] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [error, setError] = useState<string>('');

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const aspectRatio = (data?.aspectRatio as string) || '1:1';

    const inputs = (data?.inputs || [
        { id: 'prompt', label: 'Prompt', type: 'text', required: true }
    ]) as Array<{
        id: string
        label: string
        type: 'text' | 'image'
        required?: boolean
    }>;

    const outputs = (data?.outputs || [
        { id: 'image', label: 'Image', type: 'image' }
    ]) as Array<{
        id: string
        label: string
        type: 'text' | 'image'
    }>;

    const getHandleTop = (index: number, total: number) => {
        if (total <= 1) {
            return '50%'
        }
        const start = 40
        const end = 60
        const step = (end - start) / (total - 1)
        return `${start + index * step}%`
    }

    const getHandleClass = (kind: 'text' | 'image') =>
        kind === 'image'
            ? '!bg-emerald-400 !border-emerald-200'
            : '!bg-sky-400 !border-sky-200'

    const getLabelClass = (kind: 'text' | 'image') =>
        kind === 'image'
            ? 'text-emerald-300'
            : 'text-sky-300'

    const handleGenerate = async () => {
        try {
            setIsRunning(true);
            setError('');

            const apiKey = getGoogleApiKey();
            if (!apiKey) {
                throw new Error('Google AI API key not configured. Please add it in the providers page.');
            }

            inputSchema.parse({
                prompt,
                aspectRatio: aspectRatio as any
            });

            const google = createGoogleGenerativeAI({ apiKey });

            const { image } = await generateImage({
                model: google.image('imagen-4.0-generate-001'),
                prompt,
                aspectRatio: aspectRatio as any,
            });

            // Convert image to data URL
            const imageDataUrl = `data:image/png;base64,${image.base64}`;
            setImageUrl(imageDataUrl);

            if (data?.onOutputChange && typeof data.onOutputChange === 'function') {
                (data.onOutputChange as (id: string, output: string) => void)(id, imageDataUrl);
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
        if (!imageUrl) return;

        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `imagen-${Date.now()}.png`;
        link.click();
    };

    const hasOutput = !!imageUrl || !!error;

    const cardStyle = hasOutput
        ? `relative min-w-[320px] bg-card border-2 transition-all ${selected ? 'border-primary shadow-lg' : 'border-border'}`
        : `relative min-w-[200px] bg-background/50 border-2 border-dashed transition-all ${selected ? 'border-primary bg-background' : 'border-border/50'}`;


    return (
        <Card className={cardStyle}>
            <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="font-semibold text-sm">Imagen 4.0</h3>
                    </div>
                </div>

                <Button
                    onClick={handleGenerate}
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
                        'Generate Image'
                    )}
                </Button>

                {error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 my-2 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {imageUrl && (
                    <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Generated Image</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDownload}
                                className="h-6 text-xs"
                            >
                                <Download className="w-3 h-3 mr-1" />
                                Download
                            </Button>
                        </div>
                        <div className="relative rounded overflow-hidden border">
                            <img
                                src={imageUrl}
                                alt="Generated"
                                className="w-full h-auto"
                            />
                        </div>
                    </div>
                )}
            </div>

            {inputs.map((input, index) => (
                <div
                    key={`${input.id}-label`}
                    className={`absolute left-[-84px] flex items-center gap-2 text-xs -translate-y-1/2 ${getLabelClass(input.type)} ${!hasOutput && !selected ? 'opacity-50' : 'opacity-100'}`}
                    style={{ top: getHandleTop(index, inputs.length) }}
                >
                    <span>{input.label}{input.required ? '*' : ''}</span>
                </div>
            ))}
            {outputs.map((output, index) => (
                <div
                    key={`${output.id}-label`}
                    className={`absolute right-[-64px] flex items-center gap-2 text-xs -translate-y-1/2 ${getLabelClass(output.type)} ${!hasOutput && !selected ? 'opacity-50' : 'opacity-100'}`}
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
                    className={`!w-3 !h-3 !border-2 ${getHandleClass(input.type)}`}
                    style={{ top: getHandleTop(index, inputs.length) }}
                />
            ))}

            {outputs.map((output, index) => (
                <Handle
                    key={output.id}
                    type="source"
                    position={Position.Right}
                    id={output.id}
                    className={`!w-3 !h-3 !border-2 ${getHandleClass(output.type)}`}
                    style={{ top: getHandleTop(index, outputs.length) }}
                />
            ))}
        </Card>
    )
})

ImagenNode.displayName = 'ImagenNode'

export const ImagenProperties = ({ node, onUpdateNode }: { node: any, onUpdateNode: (id: string, data: any) => void }) => {
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
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
