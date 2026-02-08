"use client"

import { memo, useCallback, useEffect } from 'react'
import { Handle, Position, type NodeProps, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { GitMerge, MoreVertical, Plus } from 'lucide-react'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'

type GenericFlowNode = {
    type?: string
    data?: Record<string, unknown>
}

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

export const PromptConcatenatorNode = memo(({ data, selected, id }: NodeProps) => {
    const { updateNodeData } = useReactFlow()
    const edges = useEdges()
    const nodes = useNodes()
    const updateNodeInternals = useUpdateNodeInternals()

    const inputCount = Math.max(1, Number(data?.inputCount || 2))
    const additionalText = getStringField(data?.additionalText)
    const output = getStringField(data?.output)

    useEffect(() => {
        updateNodeInternals(id)
    }, [id, inputCount, updateNodeInternals])

    const getFreshConnectedPrompts = useCallback(() => {
        const incomingEdges = edges.filter((edge) => edge.target === id)
        const promptByHandle: Record<string, string> = {}

        incomingEdges.forEach((edge) => {
            const targetHandle = edge.targetHandle
            if (!targetHandle || !targetHandle.startsWith('prompt_')) return

            const sourceNode = nodes.find((node) => node.id === edge.source) as GenericFlowNode | undefined
            const prompt = getPromptFromSourceNode(sourceNode).trim()
            if (prompt) {
                promptByHandle[targetHandle] = prompt
            }
        })

        return Array.from({ length: inputCount })
            .map((_, index) => promptByHandle[`prompt_${index}`] || '')
            .filter((value): value is string => value.length > 0)
    }, [edges, id, inputCount, nodes])

    useEffect(() => {
        const connectedPrompts = getFreshConnectedPrompts()
        const manualText = additionalText.trim()
        const nextOutput = [...connectedPrompts, manualText]
            .filter((value) => value.length > 0)
            .join('\n\n')

        if (nextOutput !== output) {
            updateNodeData(id, { output: nextOutput })
        }
    }, [additionalText, getFreshConnectedPrompts, id, output, updateNodeData])

    const handleAddInput = () => {
        updateNodeData(id, { inputCount: inputCount + 1 })
    }

    const inputHandles = Array.from({ length: inputCount }).map((_, index) => ({
        id: `prompt_${index}`,
        label: `Prompt ${index + 1}`,
    }))

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
                                <GitMerge className="w-4 h-4 text-fuchsia-400" />
                            </div>
                            <h3 className="font-semibold text-sm">Prompt Concatenator</h3>
                        </div>
                        <NodeContextMenu nodeId={id} type="dropdown" asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </NodeContextMenu>
                    </div>

                    <Textarea
                        value={output}
                        readOnly
                        placeholder="Connect multiple prompts to one output prompt."
                        className="h-[170px] max-h-[170px] overflow-y-auto resize-none text-sm nodrag nowheel"
                    />

                    <Textarea
                        value={additionalText}
                        placeholder="Write additional text"
                        className="h-[110px] max-h-[110px] overflow-y-auto resize-none text-sm nodrag nowheel"
                        onChange={(event) => {
                            updateNodeData(id, { additionalText: event.target.value })
                        }}
                    />

                    <div className="flex items-center justify-start gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs gap-1.5"
                            onClick={handleAddInput}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add another text input
                        </Button>
                    </div>
                </div>

                {inputHandles.map((handle, index) => (
                    <div
                        key={`${handle.id}-label`}
                        className="absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase text-fuchsia-300"
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
                        className="!w-3 !h-3 !border-2 !bg-fuchsia-400 !border-fuchsia-200"
                        style={{ top: getHandleTop(index, inputHandles.length) }}
                    />
                ))}

                <div
                    className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-fuchsia-300"
                    style={{ top: '50%' }}
                >
                    Combined Prompt
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

PromptConcatenatorNode.displayName = 'PromptConcatenatorNode'
