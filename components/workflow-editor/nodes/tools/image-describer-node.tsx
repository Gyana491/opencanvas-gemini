"use client"

import { memo, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, type NodeProps, useEdges, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Copy, Image as ImageIcon, Loader2, MoreVertical, Plus, RotateCcw, ScanText } from 'lucide-react'
import { toast } from 'sonner'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { resolveImageInput } from '@/lib/utils/image-processing'
import { NodeContextMenu } from '../../node-context-menu'

type GenericFlowNode = {
    type?: string
    data?: Record<string, unknown>
}

type ImageDescriberModelOption = {
    value: string
    label: string
}

export const IMAGE_DESCRIBER_MODEL_OPTIONS: ImageDescriberModelOption[] = [
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (deprecated Mar 31, 2026)' },
    { value: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite (deprecated Mar 31, 2026)' },
]

const IMAGE_DESCRIBER_MODEL_SET = new Set(IMAGE_DESCRIBER_MODEL_OPTIONS.map((option) => option.value))
const DEFAULT_IMAGE_DESCRIBER_MODEL = 'gemini-2.5-flash'
export const DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION =
    'You are an expert image analyst tasked with providing detailed accurate and helpful descriptions of images. Your goal is to make visual content accessible through clear comprehensive text descriptions. Be objective and precise.'

const getStringField = (value: unknown): string => (typeof value === 'string' ? value : '')

const getCallableOutput = (value: unknown): string => {
    if (typeof value !== 'function') return ''
    try {
        const result = value()
        return typeof result === 'string' ? result : ''
    } catch {
        return ''
    }
}

const getImageFromSourceNode = (sourceNode: GenericFlowNode | undefined): string => {
    if (sourceNode?.type === 'imageUpload') {
        return getStringField(sourceNode?.data?.imageUrl) || getStringField(sourceNode?.data?.assetPath)
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
    )
}

export const ImageDescriberNode = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const { getNodes, updateNodeData } = useReactFlow()
    const edges = useEdges()
    const updateNodeInternals = useUpdateNodeInternals()

    const imageInputCount = Math.max(1, Number(data?.imageInputCount || 1))
    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState('')
    const [description, setDescription] = useState<string>(((data?.output as string) || '').trim())
    const modelFromData = getStringField(data?.model)
    const selectedModel = IMAGE_DESCRIBER_MODEL_SET.has(modelFromData)
        ? modelFromData
        : DEFAULT_IMAGE_DESCRIBER_MODEL
    const systemInstructionFromData = getStringField(data?.systemInstruction).trim()
    const systemInstruction = systemInstructionFromData || DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION

    useEffect(() => {
        if (!isRunning) {
            setDescription(((data?.output as string) || '').trim())
        }
    }, [data?.output, isRunning])

    useEffect(() => {
        updateNodeInternals(id)
    }, [id, imageInputCount, updateNodeInternals])

    const inputHandles = useMemo(() => {
        return Array.from({ length: imageInputCount }).map((_, index) => ({
            id: `image_${index}`,
            label: imageInputCount === 1 ? 'Image' : `Image ${index + 1}`,
        }))
    }, [imageInputCount])

    const getHandleTop = (index: number, total: number) => {
        if (total <= 1) return '50%'
        const start = 22
        const end = 78
        const step = (end - start) / (total - 1)
        return `${start + index * step}%`
    }

    const getFreshConnectedImageSources = () => {
        const nodes = getNodes()
        const incomingEdges = edges.filter((edge) => edge.target === id)
        const imageByHandle: Record<string, string> = {}

        incomingEdges.forEach((edge) => {
            const targetHandle = edge.targetHandle
            if (!targetHandle) return
            if (targetHandle !== 'image' && !targetHandle.startsWith('image_')) return

            const sourceNode = nodes.find((node) => node.id === edge.source) as GenericFlowNode | undefined
            if (!sourceNode) return

            const mappedHandle = targetHandle === 'image' ? 'image_0' : targetHandle
            const resolvedImage = getImageFromSourceNode(sourceNode)
            if (resolvedImage) {
                imageByHandle[mappedHandle] = resolvedImage
            }
        })

        return Array.from({ length: imageInputCount })
            .map((_, index) => imageByHandle[`image_${index}`] || '')
            .filter((value): value is string => value.length > 0)
    }

    const handleRun = async () => {
        try {
            setError('')
            setIsRunning(true)

            const imageSources = getFreshConnectedImageSources()
            if (imageSources.length === 0) {
                throw new Error('Connect at least one image input before running.')
            }

            const images = await Promise.all(
                imageSources.map(async (source) => {
                    const { mimeType, base64Data } = await resolveImageInput(source)
                    return { mimeType, base64Data }
                })
            )

            const response = await fetch('/api/providers/google/image-describer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId,
                    nodeId: id,
                    images,
                    model: selectedModel,
                    systemInstruction,
                }),
            })

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload.error || 'Failed to describe image.')
            }

            const payload = await response.json()
            if (!payload.success || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
                throw new Error('No description returned from the model.')
            }

            const nextOutput = payload.text.trim()
            setDescription(nextOutput)
            updateNodeData(id, { output: nextOutput })
            toast.success('Image description generated')
        } catch (runError) {
            const message = runError instanceof Error ? runError.message : 'Failed to describe image.'
            setError(message)
            toast.error(message)
        } finally {
            setIsRunning(false)
        }
    }

    const handleCopy = async () => {
        const output = description.trim()
        if (!output) {
            toast.error('Nothing to copy yet.')
            return
        }

        try {
            await navigator.clipboard.writeText(output)
            toast.success('Description copied')
        } catch {
            toast.error('Failed to copy description')
        }
    }

    const handleDescriptionChange = (value: string) => {
        setDescription(value)
        updateNodeData(id, { output: value })
    }

    const handleAddInput = () => {
        updateNodeData(id, { imageInputCount: imageInputCount + 1 })
    }

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card
                className={`relative w-[360px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
                    }`}
            >
                <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 flex items-center justify-center">
                                <ScanText className="w-4 h-4 text-fuchsia-400" />
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="font-semibold text-sm">Image Describer</h3>
                                <p className="text-[10px] text-muted-foreground">{selectedModel}</p>
                            </div>
                        </div>
                        <NodeContextMenu nodeId={id} type="dropdown" asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </NodeContextMenu>
                    </div>

                    <Textarea
                        value={description}
                        placeholder="The generated text will appear here..."
                        className="h-[220px] max-h-[220px] overflow-y-auto resize-none text-sm nodrag nowheel"
                        onChange={(event) => handleDescriptionChange(event.target.value)}
                    />

                    {error && (
                        <p className="text-xs text-destructive">{error}</p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs gap-1.5"
                            onClick={handleAddInput}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add another image input
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 gap-1.5 text-xs"
                                onClick={handleCopy}
                                disabled={!description.trim()}
                            >
                                <Copy className="w-3.5 h-3.5" />
                                Copy
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="h-8 px-3 gap-1.5 text-xs"
                                onClick={handleRun}
                                disabled={isRunning}
                            >
                                {isRunning ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <ImageIcon className="w-3.5 h-3.5" />
                                )}
                                Run
                            </Button>
                        </div>
                    </div>
                </div>

                {inputHandles.map((handle, index) => (
                    <div
                        key={`${handle.id}-label`}
                        className="absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase text-emerald-300"
                        style={{ top: getHandleTop(index, inputHandles.length) }}
                    >
                        {handle.label}
                    </div>
                ))}
                {inputHandles.map((handle, index) => (
                    <Handle
                        key={handle.id}
                        type="target"
                        position={Position.Left}
                        id={handle.id}
                        className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
                        style={{ top: getHandleTop(index, inputHandles.length) }}
                    />
                ))}

                <div
                    className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-fuchsia-300"
                    style={{ top: '50%' }}
                >
                    Text
                </div>
                <Handle
                    type="source"
                    position={Position.Right}
                    id={OUTPUT_HANDLE_IDS.text}
                    className="!w-3 !h-3 !border-2 !bg-fuchsia-400 !border-fuchsia-200"
                    style={{ top: '50%' }}
                />
            </Card>
        </NodeContextMenu>
    )
})

ImageDescriberNode.displayName = 'ImageDescriberNode'

type ImageDescriberPropertiesProps = {
    node: {
        id: string
        data?: Record<string, unknown>
    }
    onUpdateNode: (id: string, data: Record<string, unknown>) => void
}

export function ImageDescriberProperties({ node, onUpdateNode }: ImageDescriberPropertiesProps) {
    const selectedModelFromNode = getStringField(node.data?.model)
    const selectedModel = IMAGE_DESCRIBER_MODEL_SET.has(selectedModelFromNode)
        ? selectedModelFromNode
        : DEFAULT_IMAGE_DESCRIBER_MODEL
    const systemInstructionFromNode = getStringField(node.data?.systemInstruction).trim()
    const systemInstruction = systemInstructionFromNode || DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="image-describer-model" className="text-xs font-semibold">Model</Label>
                <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                        onUpdateNode(node.id, { model: value })
                    }}
                >
                    <SelectTrigger id="image-describer-model" className="h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {IMAGE_DESCRIBER_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="image-describer-system-instruction" className="text-xs font-semibold">System Instructions</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5"
                        onClick={() => {
                            onUpdateNode(node.id, { systemInstruction: DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION })
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </Button>
                </div>
                <Textarea
                    id="image-describer-system-instruction"
                    value={systemInstruction}
                    className="h-40 max-h-40 overflow-y-auto resize-none text-sm"
                    onChange={(event) => {
                        onUpdateNode(node.id, { systemInstruction: event.target.value })
                    }}
                />
            </div>
            <p className="text-xs text-muted-foreground">
                These Google Gemini models support image input. Deprecated 2.0 models are included for compatibility.
            </p>
        </div>
    )
}
