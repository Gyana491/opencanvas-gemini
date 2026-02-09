"use client"

import { BaseNode, HandleMeta } from '../base-node'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, Download, ArrowRight, LucideIcon, Plus, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageModelNodeProps {
    id: string
    selected: boolean
    title: string
    icon: LucideIcon | string
    iconClassName?: string
    isRunning: boolean
    imageUrl?: string
    error?: string
    onRun: () => void
    onDownload?: () => void
    onAddInput?: () => void
    inputs?: HandleMeta[]
    outputs?: HandleMeta[]
}

export function ImageModelNode({
    id,
    selected,
    title,
    icon: Icon,
    iconClassName,
    isRunning,
    imageUrl,
    error,
    onRun,
    onDownload,
    onAddInput,
    inputs = [],
    outputs = []
}: ImageModelNodeProps) {

    const actionButton = imageUrl ? (
        <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
                e.stopPropagation();
                onDownload?.();
            }}
            className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
        >
            <Download className="w-3.5 h-3.5" />
        </Button>
    ) : null;

    return (
        <BaseNode
            id={id}
            selected={selected}
            title={title}
            icon={Icon}
            iconClassName={iconClassName}
            className="w-[320px]"
            inputs={inputs}
            outputs={outputs}
            action={actionButton}
        >
            {/* Preview Area */}
            <div className="relative aspect-square w-full bg-[#0a0a0a] flex items-center justify-center group overflow-hidden">
                {/* Checkerboard Pattern */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'radial-gradient(#ffffff 1px, transparent 0)',
                    backgroundSize: '16px 16px'
                }} />

                {imageUrl ? (
                    <div className="relative w-full h-full p-2 animate-in fade-in duration-500">
                        <img
                            src={imageUrl}
                            alt="Generated content"
                            crossOrigin="anonymous"
                            className="w-full h-full object-contain rounded shadow-sm border border-zinc-800/50"
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-zinc-700">
                        <div className="p-4 rounded-full bg-zinc-900/40 border border-zinc-800/40">
                            {typeof Icon === 'string' ? (
                                <img src={Icon} alt={title} className="w-8 h-8 object-contain opacity-20" />
                            ) : (
                                <Icon className="w-8 h-8 opacity-20" />
                            )}
                        </div>
                        <p className="text-[10px] font-medium tracking-widest uppercase opacity-40">No Image</p>
                    </div>
                )}

                {/* Loading State */}
                {isRunning && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 z-10 animate-in fade-in duration-300">
                        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                        <span className="text-[10px] font-semibold text-zinc-400 tracking-widest uppercase animate-pulse">Processing</span>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-3 border-t border-zinc-800/40 bg-zinc-900/10 flex items-center justify-between gap-2">
                {onAddInput ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddInput();
                        }}
                        className="h-7 px-2 gap-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-zinc-800/50 hover:border-zinc-700 text-[10px] font-medium uppercase tracking-wide transition-all"
                    >
                        <Plus className="w-3 h-3" />
                        Add Image Input
                    </Button>
                ) : <div />}

                <Button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRun();
                    }}
                    disabled={isRunning}
                    size="sm"
                    className={cn(
                        "h-7 px-3 gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all",
                        "bg-zinc-100 hover:bg-white text-zinc-900 hover:scale-105 active:scale-95 shadow-sm"
                    )}
                >
                    {isRunning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <Wand2 className="w-3 h-3" />
                    )}
                    Run
                </Button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="px-3 py-2 bg-red-500/5 border-t border-red-500/10 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500/70 mt-0.5 shrink-0" />
                    <span className="text-[10px] text-red-400/80 leading-snug">{error}</span>
                </div>
            )}
        </BaseNode>
    )
}
