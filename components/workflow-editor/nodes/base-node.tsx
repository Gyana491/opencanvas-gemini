"use client"

import { Handle, Position } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MoreVertical, LucideIcon } from 'lucide-react'
import { NodeContextMenu } from '../node-context-menu'
import { cn } from '@/lib/utils'

export interface HandleMeta {
    id: string
    label: string
    type: 'text' | 'image' | 'video' | 'audio'
    required?: boolean
}

interface BaseNodeProps {
    id: string
    selected?: boolean
    title: string
    icon?: LucideIcon | string
    iconClassName?: string
    action?: React.ReactNode
    children?: React.ReactNode
    className?: string
    inputs?: HandleMeta[]
    outputs?: HandleMeta[]
    onDownload?: () => void
}

export function BaseNode({
    id,
    selected,
    title,
    icon: Icon,
    iconClassName,
    action,
    children,
    className,
    inputs = [],
    outputs = [],
    onDownload
}: BaseNodeProps) {

    const getHandleTop = (index: number, total: number) => {
        if (total <= 1) return '50%'
        // Spread handles out a bit more
        const start = 25
        const end = 75
        const step = (end - start) / (total - 1)
        return `${start + index * step}%`
    }

    const getHandleColor = (kind: string) => {
        switch (kind) {
            case 'image': return 'bg-emerald-400 border-emerald-200'
            case 'video': return 'bg-violet-400 border-violet-200'
            case 'audio': return 'bg-amber-400 border-amber-200'
            case 'text':
            default: return 'bg-sky-400 border-sky-200'
        }
    }

    const getLabelColor = (kind: string) => {
        switch (kind) {
            case 'image': return 'text-emerald-300'
            case 'video': return 'text-violet-300'
            case 'audio': return 'text-amber-300'
            case 'text':
            default: return 'text-sky-300'
        }
    }

    // Handle component
    const HandleDot = ({ type, className }: { type: string, className?: string }) => (
        <div className={cn(
            "w-3 h-3 rounded-full border-2 transition-all duration-300",
            getHandleColor(type),
            className
        )} />
    )

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card className={cn(
                "relative flex flex-col min-w-[300px] border transition-all duration-300",
                "bg-[#121212] border-zinc-800/60 shadow-xl",
                selected ? "border-zinc-600 ring-1 ring-zinc-600 shadow-2xl scale-[1.01]" : "hover:border-zinc-700",
                className
            )}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/40 bg-zinc-900/20">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className={cn("flex items-center justify-center w-6 h-6 rounded-md bg-zinc-800/50", iconClassName)}>
                                {typeof Icon === 'string' ? (
                                    <img src={Icon} alt={title} className="w-full h-full object-cover rounded-sm" />
                                ) : (
                                    <Icon className="w-3.5 h-3.5 text-zinc-400" />
                                )}
                            </div>
                        )}
                        <span className="text-xs font-medium text-zinc-300 tracking-wide">{title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {action}
                        <NodeContextMenu nodeId={id} type="dropdown" asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-200">
                                <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                        </NodeContextMenu>
                    </div>
                </div>

                {/* Content */}
                <div className="p-0">
                    {children}
                </div>

                {/* Inputs */}
                <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
                    {inputs.map((input, index) => (
                        <div
                            key={`${input.id}-input`}
                            className="absolute left-0 -translate-x-1/2 flex items-center group pointer-events-auto"
                            style={{ top: getHandleTop(index, inputs.length) }}
                        >
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={input.id}
                                className="!w-3 !h-3 !bg-transparent !border-0 opacity-0"
                            />
                            <div className="relative flex items-center">
                                <HandleDot type={input.type} />
                                <span className={cn(
                                    "absolute right-full mr-3 text-[10px] font-bold tracking-tight uppercase whitespace-nowrap bg-transparent shadow-none border-none p-0",
                                    getLabelColor(input.type)
                                )}>
                                    {input.label}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Outputs */}
                <div className="absolute right-0 top-0 bottom-0 pointer-events-none">
                    {outputs.map((output, index) => (
                        <div
                            key={`${output.id}-output`}
                            className="absolute right-0 translate-x-1/2 flex items-center group pointer-events-auto"
                            style={{ top: getHandleTop(index, outputs.length) }}
                        >
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={output.id}
                                className="!w-3 !h-3 !bg-transparent !border-0 opacity-0"
                            />
                            <div className="relative flex items-center">
                                <HandleDot type={output.type} />
                                <span className={cn(
                                    "absolute left-full ml-3 text-[10px] font-bold tracking-tight uppercase whitespace-nowrap bg-transparent shadow-none border-none p-0",
                                    getLabelColor(output.type)
                                )}>
                                    {output.label}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

            </Card>
        </NodeContextMenu>
    )
}
