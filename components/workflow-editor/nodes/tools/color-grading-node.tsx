"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MoreVertical, SlidersHorizontal, Link2, Unlink2 } from 'lucide-react'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'

type ChannelKey = 'r' | 'g' | 'b'
type LevelField = 'InMin' | 'Gamma' | 'InMax'

const DEFAULT_LEVELS = {
    rInMin: 0,
    rGamma: 1,
    rInMax: 255,
    gInMin: 0,
    gGamma: 1,
    gInMax: 255,
    bInMin: 0,
    bGamma: 1,
    bInMax: 255,
    linkChannels: true,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getNumeric = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

export const ColorGradingNode = memo(({ data, selected, id }: NodeProps) => {
    const { updateNodeData } = useReactFlow()

    const previewCanvasRef = useRef<HTMLCanvasElement>(null)
    const processingCanvasRef = useRef<HTMLCanvasElement>(null)
    const latestOutputRef = useRef<string | null>(null)
    const outputObjectUrlRef = useRef<string | null>(null)

    const connectedImage = data.connectedImage as string | undefined

    const rInMin = getNumeric(data.rInMin, DEFAULT_LEVELS.rInMin)
    const rGamma = getNumeric(data.rGamma, DEFAULT_LEVELS.rGamma)
    const rInMax = getNumeric(data.rInMax, DEFAULT_LEVELS.rInMax)
    const gInMin = getNumeric(data.gInMin, DEFAULT_LEVELS.gInMin)
    const gGamma = getNumeric(data.gGamma, DEFAULT_LEVELS.gGamma)
    const gInMax = getNumeric(data.gInMax, DEFAULT_LEVELS.gInMax)
    const bInMin = getNumeric(data.bInMin, DEFAULT_LEVELS.bInMin)
    const bGamma = getNumeric(data.bGamma, DEFAULT_LEVELS.bGamma)
    const bInMax = getNumeric(data.bInMax, DEFAULT_LEVELS.bInMax)
    const linkChannels = (data.linkChannels as boolean | undefined) ?? DEFAULT_LEVELS.linkChannels

    const channelValues = {
        r: { inMin: rInMin, gamma: rGamma, inMax: rInMax },
        g: { inMin: gInMin, gamma: gGamma, inMax: gInMax },
        b: { inMin: bInMin, gamma: bGamma, inMax: bInMax },
    } as const

    const clearCanvases = useCallback(() => {
        const previewCanvas = previewCanvasRef.current
        const processingCanvas = processingCanvasRef.current

        if (previewCanvas) {
            const previewCtx = previewCanvas.getContext('2d')
            previewCtx?.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
        }

        if (processingCanvas) {
            const processingCtx = processingCanvas.getContext('2d')
            processingCtx?.clearRect(0, 0, processingCanvas.width, processingCanvas.height)
        }
    }, [])

    const revokeOutputUrl = useCallback(() => {
        if (outputObjectUrlRef.current) {
            URL.revokeObjectURL(outputObjectUrlRef.current)
            outputObjectUrlRef.current = null
        }
    }, [])

    const getCurrentOutput = useCallback(() => {
        if (latestOutputRef.current) return latestOutputRef.current
        return null
    }, [])

    useEffect(() => {
        return () => {
            revokeOutputUrl()
        }
    }, [revokeOutputUrl])

    useEffect(() => {
        const requiredKeys = [
            'rInMin', 'rGamma', 'rInMax',
            'gInMin', 'gGamma', 'gInMax',
            'bInMin', 'bGamma', 'bInMax',
            'linkChannels',
        ] as const
        const hasMissingDefaults = requiredKeys.some((key) => data[key] === undefined)
        if (hasMissingDefaults) {
            updateNodeData(id, { ...DEFAULT_LEVELS })
        }
    }, [data, id, updateNodeData])

    const applyLevels = useCallback((
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        levels: {
            r: { inMin: number; gamma: number; inMax: number }
            g: { inMin: number; gamma: number; inMax: number }
            b: { inMin: number; gamma: number; inMax: number }
        }
    ) => {
        const imageData = ctx.getImageData(0, 0, width, height)
        const pixels = imageData.data

        const transform = (value: number, inMin: number, gamma: number, inMax: number) => {
            const safeMin = clamp(Math.round(inMin), 0, 254)
            const safeMax = clamp(Math.round(inMax), safeMin + 1, 255)
            const safeGamma = clamp(gamma, 0.1, 3)

            const normalized = clamp((value - safeMin) / (safeMax - safeMin), 0, 1)
            const corrected = Math.pow(normalized, safeGamma)
            return Math.round(corrected * 255)
        }

        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = transform(pixels[i], levels.r.inMin, levels.r.gamma, levels.r.inMax)
            pixels[i + 1] = transform(pixels[i + 1], levels.g.inMin, levels.g.gamma, levels.g.inMax)
            pixels[i + 2] = transform(pixels[i + 2], levels.b.inMin, levels.b.gamma, levels.b.inMax)
        }

        ctx.putImageData(imageData, 0, 0)
    }, [])

    useEffect(() => {
        if (!connectedImage) {
            clearCanvases()
            revokeOutputUrl()
            latestOutputRef.current = null
            updateNodeData(id, { getOutput: null, output: null, imageOutput: null })
            return
        }

        let cancelled = false
        let hasRendered = false
        const img = new Image()
        img.crossOrigin = 'Anonymous'

        const renderToCanvases = () => {
            if (cancelled || hasRendered) return
            hasRendered = true

            const previewCanvas = previewCanvasRef.current
            const processingCanvas = processingCanvasRef.current
            if (!previewCanvas || !processingCanvas) return

            previewCanvas.width = img.width
            previewCanvas.height = img.height
            processingCanvas.width = img.width
            processingCanvas.height = img.height

            const previewCtx = previewCanvas.getContext('2d')
            const processingCtx = processingCanvas.getContext('2d')
            if (!previewCtx || !processingCtx) return

            previewCtx.drawImage(img, 0, 0)
            processingCtx.drawImage(img, 0, 0)

            const levels = {
                r: { inMin: rInMin, gamma: rGamma, inMax: rInMax },
                g: { inMin: gInMin, gamma: gGamma, inMax: gInMax },
                b: { inMin: bInMin, gamma: bGamma, inMax: bInMax },
            }

            applyLevels(previewCtx, img.width, img.height, levels)
            applyLevels(processingCtx, img.width, img.height, levels)

            processingCanvas.toBlob((blob) => {
                if (cancelled) return
                if (!blob) {
                    latestOutputRef.current = null
                    updateNodeData(id, { getOutput: getCurrentOutput, output: null, imageOutput: null })
                    return
                }

                revokeOutputUrl()
                const runtimeUrl = URL.createObjectURL(blob)
                outputObjectUrlRef.current = runtimeUrl
                latestOutputRef.current = runtimeUrl
                updateNodeData(id, {
                    getOutput: getCurrentOutput,
                    output: runtimeUrl,
                    imageOutput: runtimeUrl,
                })
            }, 'image/png')
        }

        img.onload = renderToCanvases
        img.onerror = () => {
            if (cancelled) return
            clearCanvases()
            revokeOutputUrl()
            latestOutputRef.current = null
            updateNodeData(id, { getOutput: null, output: null, imageOutput: null })
        }
        img.src = connectedImage

        if (img.complete) {
            renderToCanvases()
        }

        return () => {
            cancelled = true
        }
    }, [
        connectedImage,
        rInMin, rGamma, rInMax,
        gInMin, gGamma, gInMax,
        bInMin, bGamma, bInMax,
        id,
        applyLevels,
        clearCanvases,
        getCurrentOutput,
        revokeOutputUrl,
        updateNodeData,
    ])

    const getKey = (channel: ChannelKey, field: LevelField) => `${channel}${field}` as keyof typeof DEFAULT_LEVELS

    const normalizeFieldValue = (channel: ChannelKey, field: LevelField, value: number) => {
        const current = channelValues[channel]
        if (field === 'InMin') {
            return clamp(Math.round(value), 0, Math.max(0, Math.round(current.inMax) - 1))
        }
        if (field === 'InMax') {
            return clamp(Math.round(value), Math.min(255, Math.round(current.inMin) + 1), 255)
        }
        return clamp(value, 0.1, 3)
    }

    const handleLevelChange = (channel: ChannelKey, field: LevelField, value: number) => {
        const updates: Record<string, number | boolean> = {}
        const targetChannels: ChannelKey[] = linkChannels ? ['r', 'g', 'b'] : [channel]

        targetChannels.forEach((targetChannel) => {
            updates[getKey(targetChannel, field)] = normalizeFieldValue(targetChannel, field, value)
        })

        updateNodeData(id, updates)
    }

    const handleLinkToggle = () => {
        const nextValue = !linkChannels
        if (nextValue) {
            updateNodeData(id, {
                linkChannels: true,
                gInMin: rInMin,
                gGamma: rGamma,
                gInMax: rInMax,
                bInMin: rInMin,
                bGamma: rGamma,
                bInMax: rInMax,
            })
            return
        }
        updateNodeData(id, { linkChannels: false })
    }

    const handleReset = () => {
        updateNodeData(id, { ...DEFAULT_LEVELS })
    }

    const handleNumericInput = (channel: ChannelKey, field: LevelField, rawValue: string) => {
        const parsed = Number(rawValue)
        if (Number.isNaN(parsed)) return
        handleLevelChange(channel, field, parsed)
    }

    const channelOrder = [
        { key: 'r' as const, label: 'R', className: 'text-red-400' },
        { key: 'g' as const, label: 'G', className: 'text-green-400' },
        { key: 'b' as const, label: 'B', className: 'text-blue-400' },
    ]

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card
                className={`relative w-[360px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
                    }`}
            >
                <div className="p-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                            </div>
                            <h3 className="font-semibold text-sm">Color Grading</h3>
                        </div>
                        <NodeContextMenu nodeId={id} type="dropdown" asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </NodeContextMenu>
                    </div>

                    <div className="relative aspect-square w-full rounded-md border border-border bg-muted/20 overflow-hidden flex items-center justify-center">
                        <canvas
                            ref={previewCanvasRef}
                            className={`w-full h-full object-contain ${connectedImage ? '' : 'hidden'}`}
                        />
                        {!connectedImage && (
                            <div className="text-xs text-muted-foreground text-center p-4">
                                Connect an image source
                            </div>
                        )}
                        <canvas ref={processingCanvasRef} className="hidden" />
                    </div>

                    <div className="space-y-3 bg-muted/30 p-2 rounded-md">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs">Levels Controls</Label>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleLinkToggle}>
                                    {linkChannels ? <Link2 className="w-3.5 h-3.5 mr-1" /> : <Unlink2 className="w-3.5 h-3.5 mr-1" />}
                                    {linkChannels ? 'Linked' : 'Unlinked'}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleReset}>
                                    Reset
                                </Button>
                            </div>
                        </div>

                        {channelOrder.map((channel) => {
                            const values = channelValues[channel.key]
                            return (
                                <div key={channel.key} className="space-y-2 rounded-md border border-border/50 p-2">
                                    <div className="flex items-center justify-between">
                                        <Label className={`text-xs font-semibold ${channel.className}`}>{channel.label}</Label>
                                        <span className="text-[10px] text-muted-foreground">
                                            Min {values.inMin} · Gamma {values.gamma.toFixed(2)} · Max {values.inMax}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-[56px_1fr_64px] items-center gap-2">
                                        <Label className="text-[10px] text-muted-foreground">Min</Label>
                                        <Slider
                                            value={[values.inMin]}
                                            min={0}
                                            max={254}
                                            step={1}
                                            onValueChange={(vals) => handleLevelChange(channel.key, 'InMin', vals[0])}
                                            className="py-1"
                                        />
                                        <Input
                                            type="number"
                                            value={values.inMin}
                                            min={0}
                                            max={254}
                                            onChange={(e) => handleNumericInput(channel.key, 'InMin', e.target.value)}
                                            className="h-7 text-xs"
                                        />
                                    </div>

                                    <div className="grid grid-cols-[56px_1fr_64px] items-center gap-2">
                                        <Label className="text-[10px] text-muted-foreground">Gamma</Label>
                                        <Slider
                                            value={[values.gamma]}
                                            min={0.1}
                                            max={3}
                                            step={0.01}
                                            onValueChange={(vals) => handleLevelChange(channel.key, 'Gamma', vals[0])}
                                            className="py-1"
                                        />
                                        <Input
                                            type="number"
                                            value={values.gamma.toFixed(2)}
                                            min={0.1}
                                            max={3}
                                            step={0.01}
                                            onChange={(e) => handleNumericInput(channel.key, 'Gamma', e.target.value)}
                                            className="h-7 text-xs"
                                        />
                                    </div>

                                    <div className="grid grid-cols-[56px_1fr_64px] items-center gap-2">
                                        <Label className="text-[10px] text-muted-foreground">Max</Label>
                                        <Slider
                                            value={[values.inMax]}
                                            min={1}
                                            max={255}
                                            step={1}
                                            onValueChange={(vals) => handleLevelChange(channel.key, 'InMax', vals[0])}
                                            className="py-1"
                                        />
                                        <Input
                                            type="number"
                                            value={values.inMax}
                                            min={1}
                                            max={255}
                                            onChange={(e) => handleNumericInput(channel.key, 'InMax', e.target.value)}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <Handle
                    type="target"
                    position={Position.Left}
                    id={OUTPUT_HANDLE_IDS.image}
                    className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
                    style={{ top: '50%' }}
                />

                <Handle
                    type="source"
                    position={Position.Right}
                    id={OUTPUT_HANDLE_IDS.image}
                    className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
                    style={{ top: '50%' }}
                />
            </Card>
        </NodeContextMenu>
    )
})

ColorGradingNode.displayName = 'ColorGradingNode'
