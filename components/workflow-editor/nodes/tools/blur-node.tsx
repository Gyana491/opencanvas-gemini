"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoreVertical, Sparkles } from 'lucide-react'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'
import { Button } from '@/components/ui/button'

export const BlurNode = memo(({ data, selected, id }: NodeProps) => {
    const { updateNodeData } = useReactFlow()

    // State for blur parameters (these get saved in workflow)
    const blurType = (data.blurType as 'box' | 'gaussian') || 'gaussian'
    const blurSize = (data.blurSize as number) ?? 0

    // Refs for canvas
    const previewCanvasRef = useRef<HTMLCanvasElement>(null)
    const processingCanvasRef = useRef<HTMLCanvasElement>(null)
    const latestOutputRef = useRef<string | null>(null)
    const outputObjectUrlRef = useRef<string | null>(null)

    // Get connected image from data
    const connectedImage = data.connectedImage as string | undefined

    // Box blur implementation using pixel averaging
    const applyBoxBlur = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) => {
        if (radius <= 0) return

        const imageData = ctx.getImageData(0, 0, width, height)
        const pixels = imageData.data
        const tempData = new Uint8ClampedArray(pixels)

        // Horizontal pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0

                for (let kx = -radius; kx <= radius; kx++) {
                    const nx = Math.min(Math.max(x + kx, 0), width - 1)
                    const idx = (y * width + nx) * 4
                    r += pixels[idx]
                    g += pixels[idx + 1]
                    b += pixels[idx + 2]
                    a += pixels[idx + 3]
                    count++
                }

                const idx = (y * width + x) * 4
                tempData[idx] = r / count
                tempData[idx + 1] = g / count
                tempData[idx + 2] = b / count
                tempData[idx + 3] = a / count
            }
        }

        // Vertical pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0

                for (let ky = -radius; ky <= radius; ky++) {
                    const ny = Math.min(Math.max(y + ky, 0), height - 1)
                    const idx = (ny * width + x) * 4
                    r += tempData[idx]
                    g += tempData[idx + 1]
                    b += tempData[idx + 2]
                    a += tempData[idx + 3]
                    count++
                }

                const idx = (y * width + x) * 4
                pixels[idx] = r / count
                pixels[idx + 1] = g / count
                pixels[idx + 2] = b / count
                pixels[idx + 3] = a / count
            }
        }
        ctx.putImageData(imageData, 0, 0)
    }, [])


    const clearCanvases = useCallback(() => {
        const previewCanvas = previewCanvasRef.current
        const processingCanvas = processingCanvasRef.current

        if (previewCanvas) {
            const ctx = previewCanvas.getContext('2d')
            ctx?.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
        }

        if (processingCanvas) {
            const ctx = processingCanvas.getContext('2d')
            ctx?.clearRect(0, 0, processingCanvas.width, processingCanvas.height)
        }
    }, [])

    const revokeOutputUrl = useCallback(() => {
        if (outputObjectUrlRef.current) {
            URL.revokeObjectURL(outputObjectUrlRef.current)
            outputObjectUrlRef.current = null
        }
    }, [])

    // Function to generate current output on-demand
    const getCurrentOutput = useCallback(() => {
        if (latestOutputRef.current) return latestOutputRef.current
        return null
    }, [])

    useEffect(() => {
        return () => {
            revokeOutputUrl()
        }
    }, [revokeOutputUrl])

    // Initialize defaults immediately on mount
    useEffect(() => {
        if (data.blurType === undefined || data.blurSize === undefined) {
            updateNodeData(id, {
                blurType: blurType,
                blurSize: blurSize
            })
        }
    }, [data.blurType, data.blurSize, updateNodeData, id, blurType, blurSize])

    // Process and render image to canvas
    useEffect(() => {
        if (!connectedImage) {
            clearCanvases()
            revokeOutputUrl()
            latestOutputRef.current = null
            // Store function reference for downstream nodes
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
            if (!previewCanvas || !processingCanvas) {
                return
            }

            // Set canvas dimensions to match image
            previewCanvas.width = img.width
            previewCanvas.height = img.height
            processingCanvas.width = img.width
            processingCanvas.height = img.height

            const previewCtx = previewCanvas.getContext('2d')
            const processingCtx = processingCanvas.getContext('2d')
            if (!previewCtx || !processingCtx) {
                console.error('Could not get canvas contexts')
                return
            }

            // Draw original image first
            previewCtx.filter = 'none'
            previewCtx.drawImage(img, 0, 0)
            processingCtx.filter = 'none'
            processingCtx.drawImage(img, 0, 0)

            if (blurSize > 0) {
                if (blurType === 'gaussian') {
                    // Use CSS filter for Gaussian blur (smooth, weighted)
                    previewCtx.filter = `blur(${blurSize}px)`
                    previewCtx.drawImage(img, 0, 0)
                    processingCtx.filter = `blur(${blurSize}px)`
                    processingCtx.drawImage(img, 0, 0)
                } else {
                    // Apply Box blur (sharp edges, uniform averaging)
                    applyBoxBlur(previewCtx, img.width, img.height, Math.floor(blurSize / 2))
                    applyBoxBlur(processingCtx, img.width, img.height, Math.floor(blurSize / 2))
                }
            }

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

                // Store function reference and runtime blob URL for downstream nodes.
                updateNodeData(id, {
                    getOutput: getCurrentOutput,
                    output: runtimeUrl,
                    imageOutput: runtimeUrl,
                })
            }, 'image/png')
        }
        img.onload = renderToCanvases

        // Add error handler
        img.onerror = () => {
            if (cancelled) return
            console.error('Failed to load image:', connectedImage)
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
    }, [connectedImage, blurSize, blurType, id, updateNodeData, applyBoxBlur, getCurrentOutput, clearCanvases, revokeOutputUrl])

    // Handlers for control changes
    const handleBlurTypeChange = (val: 'box' | 'gaussian') => {
        updateNodeData(id, { blurType: val })
    }

    const handleBlurSizeChange = (vals: number[]) => {
        updateNodeData(id, { blurSize: vals[0] })
    }

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card
                className={`relative w-[300px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
                    }`}
            >
                <div className="p-3 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-blue-500" />
                            </div>
                            <h3 className="font-semibold text-sm">Blur Tool</h3>
                        </div>
                        <NodeContextMenu nodeId={id} type="dropdown" asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                        </NodeContextMenu>
                    </div>

                    {/* Preview Area - Now using canvas */}
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
                        {/* Hidden processing canvas for output generation */}
                        <canvas ref={processingCanvasRef} className="hidden" />
                    </div>

                    {/* Controls */}
                    <div className="space-y-4 bg-muted/30 p-2 rounded-md">
                        <div className="space-y-2">
                            <Label className="text-xs">Blur Algorithm</Label>
                            <Select
                                value={blurType}
                                onValueChange={handleBlurTypeChange}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="box">Box Blur</SelectItem>
                                    <SelectItem value="gaussian">Gaussian Blur</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs">Radius</Label>
                                <span className="text-xs text-muted-foreground">{blurSize}px</span>
                            </div>
                            <Slider
                                value={[blurSize]}
                                min={0}
                                max={50}
                                step={1}
                                onValueChange={handleBlurSizeChange}
                                className="py-1"
                            />
                        </div>
                    </div>
                </div>

                {/* Handles */}
                <div
                    className="absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase text-emerald-300"
                    style={{ top: '50%' }}
                >
                    Image In
                </div>
                <Handle
                    type="target"
                    position={Position.Left}
                    id={OUTPUT_HANDLE_IDS.image}
                    className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
                    style={{ top: '50%' }}
                />

                <div
                    className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-emerald-300"
                    style={{ top: '50%' }}
                >
                    Image Out
                </div>
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

BlurNode.displayName = 'BlurNode'
