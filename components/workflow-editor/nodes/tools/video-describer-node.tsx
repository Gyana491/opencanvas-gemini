"use client"

import { memo, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, type NodeProps, useEdges, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Copy, Loader2, MoreVertical, RotateCcw, ScanText, Video } from 'lucide-react'
import { toast } from 'sonner'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { resolveVideoInput } from '@/lib/utils/video-processing'
import { NodeContextMenu } from '../../node-context-menu'

type GenericFlowNode = {
    type?: string
    data?: Record<string, unknown>
}

type VideoDescriberModelOption = {
    value: string
    label: string
}

export const VIDEO_DESCRIBER_MODEL_OPTIONS: VideoDescriberModelOption[] = [
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (deprecated Mar 31, 2026)' },
    { value: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite (deprecated Mar 31, 2026)' },
]

const VIDEO_DESCRIBER_MODEL_SET = new Set(VIDEO_DESCRIBER_MODEL_OPTIONS.map((option) => option.value))
const DEFAULT_VIDEO_DESCRIBER_MODEL = 'gemini-2.5-flash'
export const DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION =
    'You are an expert video analyst. Provide clear, accurate, and concise descriptions of video content using both visual and audio context. Include useful MM:SS timestamps for key moments.'
const DEFAULT_VIDEO_DESCRIBER_PROMPT =
    'Describe this video with the key events in order. Include concise MM:SS timestamps for important moments.'

const getStringField = (value: unknown): string => (typeof value === 'string' ? value : '')

const getVideoFromSourceNode = (sourceNode: GenericFlowNode | undefined): string => {
    if (!sourceNode) return ''

    return (
        getStringField(sourceNode.data?.output) ||
        getStringField(sourceNode.data?.videoOutput) ||
        getStringField(sourceNode.data?.videoUrl) ||
        getStringField(sourceNode.data?.videoBlobUrl) ||
        getStringField(sourceNode.data?.assetPath) ||
        getStringField(sourceNode.data?.connectedVideo)
    )
}

export const VideoDescriberNode = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const { getNodes, updateNodeData } = useReactFlow()
    const edges = useEdges()

    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState('')
    const [description, setDescription] = useState<string>(((data?.output as string) || '').trim())

    const modelFromData = getStringField(data?.model)
    const selectedModel = VIDEO_DESCRIBER_MODEL_SET.has(modelFromData)
        ? modelFromData
        : DEFAULT_VIDEO_DESCRIBER_MODEL
    const systemInstructionFromData = getStringField(data?.systemInstruction).trim()
    const systemInstruction = systemInstructionFromData || DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION
    const promptFromData = getStringField(data?.prompt).trim()
    const prompt = promptFromData || DEFAULT_VIDEO_DESCRIBER_PROMPT

    useEffect(() => {
        if (!isRunning) {
            setDescription(((data?.output as string) || '').trim())
        }
    }, [data?.output, isRunning])

    const getFreshConnectedVideoSource = () => {
        const nodes = getNodes()
        const incomingVideoEdge = edges.find((edge) => {
            return edge.target === id && (edge.targetHandle === 'video' || edge.targetHandle === OUTPUT_HANDLE_IDS.video)
        })
        if (!incomingVideoEdge) return ''

        const sourceNode = nodes.find((node) => node.id === incomingVideoEdge.source) as GenericFlowNode | undefined
        return getVideoFromSourceNode(sourceNode)
    }

    const handleRun = async () => {
        try {
            setError('')
            setIsRunning(true)

            const videoSource = getFreshConnectedVideoSource()
            if (!videoSource) {
                throw new Error('Connect a video input before running.')
            }

            let requestVideo: { sourceUrl: string; mimeType?: string; base64Data?: string }
            if (videoSource.startsWith('blob:') || videoSource.startsWith('data:')) {
                const resolved = await resolveVideoInput(videoSource)
                requestVideo = {
                    sourceUrl: videoSource,
                    mimeType: resolved.mimeType,
                    base64Data: resolved.base64Data,
                }
            } else {
                requestVideo = {
                    sourceUrl: videoSource,
                }
            }

            const response = await fetch('/api/providers/google/video-describer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId,
                    nodeId: id,
                    video: requestVideo,
                    prompt,
                    model: selectedModel,
                    systemInstruction,
                }),
            })

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload.error || 'Failed to describe video.')
            }

            const payload = await response.json()
            if (!payload.success || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
                throw new Error('No description returned from the model.')
            }

            const nextOutput = payload.text.trim()
            setDescription(nextOutput)
            updateNodeData(id, { output: nextOutput })
            toast.success('Video description generated')
        } catch (runError) {
            const message = runError instanceof Error ? runError.message : 'Failed to describe video.'
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

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card
                className={`relative w-[360px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
                    }`}
            >
                <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                <ScanText className="w-4 h-4 text-violet-400" />
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="font-semibold text-sm">Video Describer</h3>
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

                    <div className="flex items-center justify-end gap-2">
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
                                <Video className="w-3.5 h-3.5" />
                            )}
                            Run
                        </Button>
                    </div>
                </div>

                <div
                    className="absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase text-violet-300"
                    style={{ top: '50%' }}
                >
                    Video
                </div>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="video"
                    className="!w-3 !h-3 !border-2 !bg-violet-400 !border-violet-200"
                    style={{ top: '50%' }}
                />

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

VideoDescriberNode.displayName = 'VideoDescriberNode'

type VideoDescriberPropertiesProps = {
    node: {
        id: string
        data?: Record<string, unknown>
    }
    onUpdateNode: (id: string, data: Record<string, unknown>) => void
}

export function VideoDescriberProperties({ node, onUpdateNode }: VideoDescriberPropertiesProps) {
    const selectedModelFromNode = getStringField(node.data?.model)
    const selectedModel = VIDEO_DESCRIBER_MODEL_SET.has(selectedModelFromNode)
        ? selectedModelFromNode
        : DEFAULT_VIDEO_DESCRIBER_MODEL
    const systemInstructionFromNode = getStringField(node.data?.systemInstruction).trim()
    const systemInstruction = systemInstructionFromNode || DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION
    const promptFromNode = getStringField(node.data?.prompt).trim()
    const prompt = promptFromNode || DEFAULT_VIDEO_DESCRIBER_PROMPT

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="video-describer-model" className="text-xs font-semibold">Model</Label>
                <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                        onUpdateNode(node.id, { model: value })
                    }}
                >
                    <SelectTrigger id="video-describer-model" className="h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {VIDEO_DESCRIBER_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="video-describer-prompt" className="text-xs font-semibold">Prompt</Label>
                <Textarea
                    id="video-describer-prompt"
                    value={prompt}
                    className="h-24 max-h-24 overflow-y-auto resize-none text-sm"
                    onChange={(event) => {
                        onUpdateNode(node.id, { prompt: event.target.value })
                    }}
                />
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="video-describer-system-instruction" className="text-xs font-semibold">System Instructions</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5"
                        onClick={() => {
                            onUpdateNode(node.id, { systemInstruction: DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION })
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </Button>
                </div>
                <Textarea
                    id="video-describer-system-instruction"
                    value={systemInstruction}
                    className="h-40 max-h-40 overflow-y-auto resize-none text-sm"
                    onChange={(event) => {
                        onUpdateNode(node.id, { systemInstruction: event.target.value })
                    }}
                />
            </div>
            <p className="text-xs text-muted-foreground">
                Supports Gemini multimodal models for video understanding. Large video inputs automatically use the Files API.
            </p>
        </div>
    )
}
