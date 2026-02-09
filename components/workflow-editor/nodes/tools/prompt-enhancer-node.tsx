"use client"

import { memo, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, type NodeProps, useEdges, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, MoreVertical, Plus, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'
import { resolveImageInput } from '@/lib/utils/image-processing'

type PromptEnhancerModelOption = {
    value: string
    label: string
}

type GenericFlowNode = {
    type?: string
    data?: Record<string, unknown>
}

export const PROMPT_ENHANCER_MODEL_OPTIONS: PromptEnhancerModelOption[] = [
    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (deprecated Mar 31, 2026)' },
    { value: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite (deprecated Mar 31, 2026)' },
]

const PROMPT_ENHANCER_MODEL_SET = new Set(PROMPT_ENHANCER_MODEL_OPTIONS.map((option) => option.value))
export const DEFAULT_PROMPT_ENHANCER_MODEL = 'gemini-2.5-flash'
export const DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION =
    'Your job is to write prompts for text-to-image models. Your input will be a general description for the scene. Write a detailed prompt without any additions, and keep it to no more than 3 sentences.'

const getStringField = (value: unknown): string => (typeof value === 'string' ? value : '')

const getPromptFromSourceNode = (sourceNode: GenericFlowNode | undefined): string => {
    if (!sourceNode) return ''

    if (sourceNode.type === 'textInput') {
        return getStringField(sourceNode.data?.text)
    }

    return (
        getStringField(sourceNode.data?.output) ||
        getStringField(sourceNode.data?.prompt) ||
        getStringField(sourceNode.data?.connectedPrompt)
    )
}

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
    if (!sourceNode) return ''

    if (sourceNode.type === 'imageUpload') {
        return getStringField(sourceNode.data?.imageUrl) || getStringField(sourceNode.data?.assetPath)
    }

    return (
        getStringField(sourceNode.data?.output) ||
        getStringField(sourceNode.data?.imageOutput) ||
        getStringField(sourceNode.data?.maskOutput) ||
        getStringField(sourceNode.data?.imageUrl) ||
        getStringField(sourceNode.data?.assetPath) ||
        getStringField(sourceNode.data?.connectedImage) ||
        getCallableOutput(sourceNode.data?.getOutput) ||
        getCallableOutput(sourceNode.data?.getMaskOutput)
    )
}

export const PromptEnhancerNode = memo(({ data, selected, id }: NodeProps) => {
    const params = useParams()
    const workflowId = params?.id as string
    const edges = useEdges()
    const { getNodes, updateNodeData } = useReactFlow()
    const updateNodeInternals = useUpdateNodeInternals()

    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState('')
    const [output, setOutput] = useState<string>(getStringField(data?.output).trim())
    const imageInputCount = Math.max(1, Number(data?.imageInputCount || 1))

    const modelFromData = getStringField(data?.model)
    const selectedModel = PROMPT_ENHANCER_MODEL_SET.has(modelFromData)
        ? modelFromData
        : DEFAULT_PROMPT_ENHANCER_MODEL
    const systemInstructionFromData = getStringField(data?.systemInstruction).trim()
    const systemInstruction = systemInstructionFromData || DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION

    useEffect(() => {
        if (!isRunning) {
            setOutput(getStringField(data?.output).trim())
        }
    }, [data?.output, isRunning])

    // Notify React Flow when the number of image input handles changes
    useEffect(() => {
        updateNodeInternals(id)
    }, [id, imageInputCount, updateNodeInternals])

    const getFreshConnectedPrompt = () => {
        const nodes = getNodes()
        const incomingEdges = edges.filter((edge) => edge.target === id && edge.targetHandle === 'prompt')

        let freshPrompt = ''
        incomingEdges.forEach((edge) => {
            const sourceNode = nodes.find((node) => node.id === edge.source) as GenericFlowNode | undefined
            const candidatePrompt = getPromptFromSourceNode(sourceNode)
            if (candidatePrompt) {
                freshPrompt = candidatePrompt
            }
        })

        return (
            freshPrompt ||
            getStringField(data?.prompt)
        )
    }

    const getFreshConnectedImageSources = () => {
        const nodes = getNodes()
        const incomingEdges = edges.filter((edge) => edge.target === id)
        const imageByHandle: Record<string, string> = {}

        incomingEdges.forEach((edge) => {
            const targetHandle = edge.targetHandle
            if (!targetHandle || !targetHandle.startsWith('image_')) return

            const sourceNode = nodes.find((node) => node.id === edge.source) as GenericFlowNode | undefined
            const resolvedImage = getImageFromSourceNode(sourceNode)
            if (resolvedImage) {
                imageByHandle[targetHandle] = resolvedImage
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

            const prompt = getFreshConnectedPrompt().trim()
            if (!prompt) {
                throw new Error('Connect a prompt input before running.')
            }

            const imageSources = getFreshConnectedImageSources()
            const images = await Promise.all(
                imageSources.map(async (source) => {
                    const { mimeType, base64Data } = await resolveImageInput(source)
                    return { mimeType, base64Data }
                })
            )

            const response = await fetch('/api/providers/google/prompt-enhancer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    workflowId,
                    nodeId: id,
                    prompt,
                    images,
                    model: selectedModel,
                    systemInstruction,
                }),
            })

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload.error || 'Failed to enhance prompt.')
            }

            const payload = await response.json()
            if (!payload.success || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
                throw new Error('No enhanced prompt returned from the model.')
            }

            const enhancedPrompt = payload.text.trim()
            setOutput(enhancedPrompt)
            updateNodeData(id, { output: enhancedPrompt })
            toast.success('Prompt enhanced')
        } catch (runError) {
            const message = runError instanceof Error ? runError.message : 'Failed to enhance prompt.'
            setError(message)
            toast.error(message)
        } finally {
            setIsRunning(false)
        }
    }

    const handleOutputChange = (nextOutput: string) => {
        setOutput(nextOutput)
        updateNodeData(id, { output: nextOutput })
    }

    const handleAddInput = () => {
        updateNodeData(id, { imageInputCount: imageInputCount + 1 })
    }

    const inputHandles = [
        { id: 'prompt', label: 'Prompt*', type: 'text' as const },
        ...Array.from({ length: imageInputCount }).map((_, index) => ({
            id: `image_${index}`,
            label: `Image ${index + 1}`,
            type: 'image' as const,
        })),
    ]

    const getHandleTop = (index: number, total: number) => {
        if (total <= 1) return '50%'
        const start = 18
        const end = 78
        const step = (end - start) / (total - 1)
        return `${start + index * step}%`
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
                                <Sparkles className="w-4 h-4 text-fuchsia-400" />
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="font-semibold text-sm">Prompt Enhancer</h3>
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
                        value={output}
                        placeholder="The generated text will appear here"
                        className="h-[220px] max-h-[220px] overflow-y-auto resize-none text-sm nodrag nowheel"
                        onChange={(event) => handleOutputChange(event.target.value)}
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
                            <Plus className="h-3.5 w-3.5" />
                            Add another image input
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 gap-1.5 text-xs"
                            onClick={handleRun}
                            disabled={isRunning}
                        >
                            {isRunning ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Wand2 className="h-3.5 w-3.5" />
                            )}
                            Run Model
                        </Button>
                    </div>
                </div>

                {inputHandles.map((handle, index) => (
                    <div
                        key={`${handle.id}-label`}
                        className={`absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase ${handle.type === 'text' ? 'text-fuchsia-300' : 'text-emerald-300'}`}
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
                        className={`!w-3 !h-3 !border-2 ${handle.type === 'text' ? '!bg-fuchsia-400 !border-fuchsia-200' : '!bg-emerald-400 !border-emerald-200'}`}
                        style={{ top: getHandleTop(index, inputHandles.length) }}
                    />
                ))}

                <div
                    className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-fuchsia-300"
                    style={{ top: '50%' }}
                >
                    Enhanced Prompt
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

PromptEnhancerNode.displayName = 'PromptEnhancerNode'

type PromptEnhancerPropertiesProps = {
    node: {
        id: string
        data?: Record<string, unknown>
    }
    onUpdateNode: (id: string, data: Record<string, unknown>) => void
}

export function PromptEnhancerProperties({ node, onUpdateNode }: PromptEnhancerPropertiesProps) {
    const selectedModelFromNode = getStringField(node.data?.model)
    const selectedModel = PROMPT_ENHANCER_MODEL_SET.has(selectedModelFromNode)
        ? selectedModelFromNode
        : DEFAULT_PROMPT_ENHANCER_MODEL
    const systemInstructionFromNode = getStringField(node.data?.systemInstruction).trim()
    const systemInstruction = systemInstructionFromNode || DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="prompt-enhancer-model" className="text-xs font-semibold">Model</Label>
                <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                        onUpdateNode(node.id, { model: value })
                    }}
                >
                    <SelectTrigger id="prompt-enhancer-model" className="h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PROMPT_ENHANCER_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="prompt-enhancer-system-instruction" className="text-xs font-semibold">System Instructions</Label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5"
                        onClick={() => {
                            onUpdateNode(node.id, { systemInstruction: DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION })
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </Button>
                </div>
                <Textarea
                    id="prompt-enhancer-system-instruction"
                    value={systemInstruction}
                    className="h-40 max-h-40 overflow-y-auto resize-none text-sm"
                    onChange={(event) => {
                        onUpdateNode(node.id, { systemInstruction: event.target.value })
                    }}
                />
            </div>
            <p className="text-xs text-muted-foreground">
                Output is plain enhanced prompt text, ready to connect into downstream prompt inputs.
            </p>
        </div>
    )
}
