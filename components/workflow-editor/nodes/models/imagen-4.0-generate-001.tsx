"use client"

import { memo, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, NodeProps, useReactFlow, useEdges } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Image as ImageIcon, Download } from 'lucide-react'
import { z } from 'zod'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageModelNode } from './image-model-node'
import { downloadMedia } from '@/lib/utils/download'
import { PROVIDERS } from '@/data/providers';
import { MODELS } from '@/data/models';

const googleProvider = PROVIDERS.find(p => p.id === 'google');

const inputSchema = z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).optional(),
});

export const Imagen40Generate001Node = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const [isRunning, setIsRunning] = useState(false);
    const { getNodes } = useReactFlow();
    const edges = useEdges();

    const getInitialImage = () => {
        return (data?.output as string) || (data?.imageUrl as string) || ''
    }

    const [imageUrl, setImageUrl] = useState<string>(getInitialImage());
    const [error, setError] = useState<string>('');

    const prompt = (data?.connectedPrompt as string) || (data?.prompt as string) || '';
    const aspectRatio = (data?.aspectRatio as string) || '1:1';

    // Update image URL when data changes (e.g. on load)
    useEffect(() => {
        if (!isRunning) {
            setImageUrl(getInitialImage())
        }
    }, [data?.output, data?.imageUrl])

    const inputs = (data?.inputs || [
        { id: 'prompt', label: 'Prompt', type: 'text', required: true }
    ]) as any[];

    const outputs = (data?.outputs || [
        { id: 'image', label: 'Image', type: 'image' }
    ]) as any[];

    const getFreshConnectedPrompt = () => {
        const nodes = getNodes();
        const incomingEdges = edges.filter(edge => edge.target === id);

        let freshPrompt = '';

        incomingEdges.forEach(edge => {
            if (edge.targetHandle !== 'prompt') return;

            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            if (sourceNode.type === 'textInput') {
                freshPrompt = (sourceNode.data?.text as string) || '';
                return;
            }

            if (typeof sourceNode.data?.output === 'string') {
                freshPrompt = sourceNode.data.output;
            }
        });

        return freshPrompt;
    };

    const handleGenerate = async () => {
        try {
            setIsRunning(true);
            setError('');
            const freshPrompt = getFreshConnectedPrompt();
            const finalPrompt = freshPrompt || prompt;

            // Validating inputs
            inputSchema.parse({
                prompt: finalPrompt,
                aspectRatio: aspectRatio as any
            });

            // Call server-side API (which handles R2 upload)
            const response = await fetch('/api/providers/google/imagen-4.0-generate-001', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    aspectRatio,
                    workflowId,
                    nodeId: id
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate image');
            }

            const responseData = await response.json();

            if (responseData.success && responseData.url) {
                const assetPathStr = responseData.url;
                setImageUrl(assetPathStr);

                if (data?.onUpdateNodeData && typeof data.onUpdateNodeData === 'function') {
                    (data.onUpdateNodeData as (id: string, data: any) => void)(id, {
                        output: assetPathStr,
                        assetPath: assetPathStr,
                        imageUrl: assetPathStr
                    });
                }
            } else {
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
        downloadMedia(imageUrl, `imagen-4.0-generate-001-${Date.now()}.png`);
    };

    const model = MODELS.find(m => m.id === 'imagen-4.0-generate-001');

    return (
        <ImageModelNode
            id={id}
            selected={selected}
            title={model?.title || "Imagen 4.0"}
            icon={googleProvider?.logo || ImageIcon}
            iconClassName="bg-white"
            isRunning={isRunning}
            imageUrl={imageUrl}
            error={error}
            onRun={handleGenerate}
            onDownload={handleDownload}
            inputs={inputs}
            outputs={outputs}
        />
    )
})

Imagen40Generate001Node.displayName = 'Imagen40Generate001Node'

export const Imagen40Generate001Properties = ({ node, onUpdateNode }: { node: any, onUpdateNode: (id: string, data: any) => void }) => {
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
