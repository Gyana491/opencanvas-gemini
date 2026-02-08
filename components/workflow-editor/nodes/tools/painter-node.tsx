"use client"

import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoreVertical, Brush, Eraser, Undo2, Redo2, Trash2, Paintbrush } from 'lucide-react'
import { OUTPUT_HANDLE_IDS, TOOL_OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'

type PainterMode = 'brush' | 'eraser'

type Point = {
    x: number
    y: number
}

type PainterSnapshot = {
    paint: ImageData
    mask: ImageData
}

const DEFAULT_PAINTER = {
    mode: 'brush' as PainterMode,
    brushSize: 32,
    brushColor: '#ff0000',
    opacity: 1,
}

const MAX_HISTORY = 30

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

const hexToRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace('#', '')
    if (!/^[0-9a-fA-F]{3,6}$/.test(normalized)) {
        return `rgba(255, 0, 0, ${alpha})`
    }

    const full = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized.slice(0, 6)

    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const canvasToBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png')
    })

export const PainterNode = memo(({ data, selected, id }: NodeProps) => {
    const { updateNodeData } = useReactFlow()

    const previewCanvasRef = useRef<HTMLCanvasElement>(null)
    const baseCanvasRef = useRef<HTMLCanvasElement>(null)
    const paintCanvasRef = useRef<HTMLCanvasElement>(null)
    const maskCanvasRef = useRef<HTMLCanvasElement>(null)

    const isDrawingRef = useRef(false)
    const didDrawRef = useRef(false)
    const lastPointRef = useRef<Point | null>(null)

    const historyRef = useRef<PainterSnapshot[]>([])
    const historyIndexRef = useRef(-1)
    const emitRafRef = useRef<number | null>(null)
    const exportVersionRef = useRef(0)

    const resultOutputUrlRef = useRef<string | null>(null)
    const maskOutputUrlRef = useRef<string | null>(null)
    const latestResultRef = useRef<string | null>(null)
    const latestMaskRef = useRef<string | null>(null)

    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })

    const connectedImage = data.connectedImage as string | undefined
    const mode = (data.mode as PainterMode | undefined) || DEFAULT_PAINTER.mode
    const brushSize = clamp(Math.round(getNumber(data.brushSize, DEFAULT_PAINTER.brushSize)), 1, 256)
    const opacity = clamp(getNumber(data.opacity, DEFAULT_PAINTER.opacity), 0, 1)
    const brushColor = typeof data.brushColor === 'string' ? data.brushColor : DEFAULT_PAINTER.brushColor

    const syncHistoryState = useCallback(() => {
        const index = historyIndexRef.current
        const length = historyRef.current.length
        setHistoryState({
            canUndo: index > 0,
            canRedo: index >= 0 && index < length - 1,
        })
    }, [])

    const revokeOutputUrls = useCallback(() => {
        if (resultOutputUrlRef.current) {
            URL.revokeObjectURL(resultOutputUrlRef.current)
            resultOutputUrlRef.current = null
        }
        if (maskOutputUrlRef.current) {
            URL.revokeObjectURL(maskOutputUrlRef.current)
            maskOutputUrlRef.current = null
        }
    }, [])

    const getCurrentOutput = useCallback(() => {
        return latestResultRef.current
    }, [])

    const getCurrentMaskOutput = useCallback(() => {
        return latestMaskRef.current
    }, [])

    const setCanvasCursor = useCallback((cursor: string) => {
        const previewCanvas = previewCanvasRef.current
        if (previewCanvas) {
            previewCanvas.style.cursor = cursor
        }
    }, [])

    const resetMaskToBlack = useCallback(() => {
        const maskCanvas = maskCanvasRef.current
        if (!maskCanvas) return
        const maskCtx = maskCanvas.getContext('2d')
        if (!maskCtx) return
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
        maskCtx.fillStyle = '#000000'
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
    }, [])

    const clearPreview = useCallback(() => {
        const previewCanvas = previewCanvasRef.current
        if (!previewCanvas) return
        const previewCtx = previewCanvas.getContext('2d')
        if (!previewCtx) return
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    }, [])

    const drawPreview = useCallback(() => {
        const previewCanvas = previewCanvasRef.current
        const baseCanvas = baseCanvasRef.current
        const paintCanvas = paintCanvasRef.current
        if (!previewCanvas || !baseCanvas || !paintCanvas) return

        if (previewCanvas.width !== baseCanvas.width) previewCanvas.width = baseCanvas.width
        if (previewCanvas.height !== baseCanvas.height) previewCanvas.height = baseCanvas.height

        const previewCtx = previewCanvas.getContext('2d')
        if (!previewCtx) return

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
        previewCtx.drawImage(baseCanvas, 0, 0)
        previewCtx.drawImage(paintCanvas, 0, 0)
    }, [])

    const emitOutputs = useCallback(async () => {
        const baseCanvas = baseCanvasRef.current
        const paintCanvas = paintCanvasRef.current
        const maskCanvas = maskCanvasRef.current

        if (!baseCanvas || !paintCanvas || !maskCanvas || baseCanvas.width === 0 || baseCanvas.height === 0) {
            revokeOutputUrls()
            latestResultRef.current = null
            latestMaskRef.current = null
            updateNodeData(id, {
                getOutput: null,
                output: null,
                imageOutput: null,
                getMaskOutput: null,
                maskOutput: null,
            })
            return
        }

        const version = ++exportVersionRef.current
        const resultCanvas = document.createElement('canvas')
        resultCanvas.width = baseCanvas.width
        resultCanvas.height = baseCanvas.height

        const resultCtx = resultCanvas.getContext('2d')
        if (!resultCtx) return
        resultCtx.drawImage(baseCanvas, 0, 0)
        resultCtx.drawImage(paintCanvas, 0, 0)

        const [resultBlob, maskBlob] = await Promise.all([
            canvasToBlob(resultCanvas),
            canvasToBlob(maskCanvas),
        ])

        if (version !== exportVersionRef.current) {
            return
        }

        revokeOutputUrls()

        const resultUrl = resultBlob ? URL.createObjectURL(resultBlob) : null
        const maskUrl = maskBlob ? URL.createObjectURL(maskBlob) : null

        resultOutputUrlRef.current = resultUrl
        maskOutputUrlRef.current = maskUrl
        latestResultRef.current = resultUrl
        latestMaskRef.current = maskUrl

        updateNodeData(id, {
            getOutput: getCurrentOutput,
            output: resultUrl,
            imageOutput: resultUrl,
            getMaskOutput: getCurrentMaskOutput,
            maskOutput: maskUrl,
        })
    }, [getCurrentMaskOutput, getCurrentOutput, id, revokeOutputUrls, updateNodeData])

    const scheduleEmitOutputs = useCallback(() => {
        if (emitRafRef.current !== null) return

        emitRafRef.current = window.requestAnimationFrame(() => {
            emitRafRef.current = null
            void emitOutputs()
        })
    }, [emitOutputs])

    const captureSnapshot = useCallback((): PainterSnapshot | null => {
        const paintCanvas = paintCanvasRef.current
        const maskCanvas = maskCanvasRef.current
        if (!paintCanvas || !maskCanvas || paintCanvas.width === 0 || paintCanvas.height === 0) {
            return null
        }

        const paintCtx = paintCanvas.getContext('2d')
        const maskCtx = maskCanvas.getContext('2d')
        if (!paintCtx || !maskCtx) return null

        return {
            paint: paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height),
            mask: maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height),
        }
    }, [])

    const applySnapshot = useCallback((snapshot: PainterSnapshot) => {
        const paintCanvas = paintCanvasRef.current
        const maskCanvas = maskCanvasRef.current
        if (!paintCanvas || !maskCanvas) return

        const paintCtx = paintCanvas.getContext('2d')
        const maskCtx = maskCanvas.getContext('2d')
        if (!paintCtx || !maskCtx) return

        paintCtx.putImageData(snapshot.paint, 0, 0)
        maskCtx.putImageData(snapshot.mask, 0, 0)
        drawPreview()
        scheduleEmitOutputs()
    }, [drawPreview, scheduleEmitOutputs])

    const pushHistory = useCallback(() => {
        const snapshot = captureSnapshot()
        if (!snapshot) return

        const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
        nextHistory.push(snapshot)

        if (nextHistory.length > MAX_HISTORY) {
            nextHistory.shift()
        }

        historyRef.current = nextHistory
        historyIndexRef.current = nextHistory.length - 1
        syncHistoryState()
    }, [captureSnapshot, syncHistoryState])

    const drawStroke = useCallback((from: Point, to: Point) => {
        const paintCanvas = paintCanvasRef.current
        const maskCanvas = maskCanvasRef.current
        if (!paintCanvas || !maskCanvas) return

        const paintCtx = paintCanvas.getContext('2d')
        const maskCtx = maskCanvas.getContext('2d')
        if (!paintCtx || !maskCtx) return

        paintCtx.lineCap = 'round'
        paintCtx.lineJoin = 'round'
        paintCtx.lineWidth = brushSize
        paintCtx.globalCompositeOperation = mode === 'eraser' ? 'destination-out' : 'source-over'
        paintCtx.strokeStyle = mode === 'eraser'
            ? 'rgba(0, 0, 0, 1)'
            : hexToRgba(brushColor, opacity)
        paintCtx.beginPath()
        paintCtx.moveTo(from.x, from.y)
        paintCtx.lineTo(to.x, to.y)
        paintCtx.stroke()

        maskCtx.lineCap = 'round'
        maskCtx.lineJoin = 'round'
        maskCtx.lineWidth = brushSize
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.strokeStyle = mode === 'eraser' ? '#000000' : '#ffffff'
        maskCtx.beginPath()
        maskCtx.moveTo(from.x, from.y)
        maskCtx.lineTo(to.x, to.y)
        maskCtx.stroke()

        drawPreview()
    }, [brushColor, brushSize, drawPreview, mode, opacity])

    const toCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const previewCanvas = previewCanvasRef.current
        if (!previewCanvas) return null

        const rect = previewCanvas.getBoundingClientRect()
        if (!rect.width || !rect.height) return null

        return {
            x: ((event.clientX - rect.left) / rect.width) * previewCanvas.width,
            y: ((event.clientY - rect.top) / rect.height) * previewCanvas.height,
        }
    }, [])

    const clearPaintLayers = useCallback(() => {
        const paintCanvas = paintCanvasRef.current
        if (!paintCanvas) return
        const paintCtx = paintCanvas.getContext('2d')
        if (!paintCtx) return

        paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
        resetMaskToBlack()
        drawPreview()
        pushHistory()
        scheduleEmitOutputs()
    }, [drawPreview, pushHistory, resetMaskToBlack, scheduleEmitOutputs])

    const handleUndo = useCallback(() => {
        const nextIndex = historyIndexRef.current - 1
        if (nextIndex < 0) return
        historyIndexRef.current = nextIndex
        const snapshot = historyRef.current[nextIndex]
        if (snapshot) {
            applySnapshot(snapshot)
        }
        syncHistoryState()
    }, [applySnapshot, syncHistoryState])

    const handleRedo = useCallback(() => {
        const nextIndex = historyIndexRef.current + 1
        if (nextIndex >= historyRef.current.length) return
        historyIndexRef.current = nextIndex
        const snapshot = historyRef.current[nextIndex]
        if (snapshot) {
            applySnapshot(snapshot)
        }
        syncHistoryState()
    }, [applySnapshot, syncHistoryState])

    useEffect(() => {
        const requiredKeys = ['mode', 'brushSize', 'brushColor', 'opacity'] as const
        const hasMissingDefaults = requiredKeys.some((key) => data[key] === undefined)
        if (hasMissingDefaults) {
            updateNodeData(id, { ...DEFAULT_PAINTER })
        }
    }, [data, id, updateNodeData])

    useEffect(() => {
        if (!connectedImage) {
            isDrawingRef.current = false
            didDrawRef.current = false
            lastPointRef.current = null
            historyRef.current = []
            historyIndexRef.current = -1
            syncHistoryState()

            const previewCanvas = previewCanvasRef.current
            const baseCanvas = baseCanvasRef.current
            const paintCanvas = paintCanvasRef.current
            const maskCanvas = maskCanvasRef.current

            if (previewCanvas) {
                const previewCtx = previewCanvas.getContext('2d')
                previewCtx?.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
                previewCanvas.width = 0
                previewCanvas.height = 0
            }
            if (baseCanvas) {
                const baseCtx = baseCanvas.getContext('2d')
                baseCtx?.clearRect(0, 0, baseCanvas.width, baseCanvas.height)
                baseCanvas.width = 0
                baseCanvas.height = 0
            }
            if (paintCanvas) {
                const paintCtx = paintCanvas.getContext('2d')
                paintCtx?.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
                paintCanvas.width = 0
                paintCanvas.height = 0
            }
            if (maskCanvas) {
                const maskCtx = maskCanvas.getContext('2d')
                maskCtx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
                maskCanvas.width = 0
                maskCanvas.height = 0
            }

            revokeOutputUrls()
            latestResultRef.current = null
            latestMaskRef.current = null
            updateNodeData(id, {
                getOutput: null,
                output: null,
                imageOutput: null,
                getMaskOutput: null,
                maskOutput: null,
            })
            setCanvasCursor('default')
            return
        }

        let cancelled = false
        const img = new Image()
        img.crossOrigin = 'Anonymous'

        const renderLoadedImage = () => {
            if (cancelled) return
            const previewCanvas = previewCanvasRef.current
            const baseCanvas = baseCanvasRef.current
            const paintCanvas = paintCanvasRef.current
            const maskCanvas = maskCanvasRef.current
            if (!previewCanvas || !baseCanvas || !paintCanvas || !maskCanvas) return

            const width = Math.max(1, img.width)
            const height = Math.max(1, img.height)

            previewCanvas.width = width
            previewCanvas.height = height
            baseCanvas.width = width
            baseCanvas.height = height
            paintCanvas.width = width
            paintCanvas.height = height
            maskCanvas.width = width
            maskCanvas.height = height

            const baseCtx = baseCanvas.getContext('2d')
            const paintCtx = paintCanvas.getContext('2d')
            if (!baseCtx || !paintCtx) return

            baseCtx.clearRect(0, 0, width, height)
            baseCtx.drawImage(img, 0, 0, width, height)
            paintCtx.clearRect(0, 0, width, height)
            resetMaskToBlack()
            drawPreview()

            historyRef.current = []
            historyIndexRef.current = -1
            pushHistory()
            scheduleEmitOutputs()
            setCanvasCursor('crosshair')
        }

        img.onload = renderLoadedImage
        img.onerror = () => {
            if (cancelled) return
            clearPreview()
            revokeOutputUrls()
            latestResultRef.current = null
            latestMaskRef.current = null
            updateNodeData(id, {
                getOutput: null,
                output: null,
                imageOutput: null,
                getMaskOutput: null,
                maskOutput: null,
            })
        }
        img.src = connectedImage

        if (img.complete) {
            renderLoadedImage()
        }

        return () => {
            cancelled = true
        }
    }, [
        clearPreview,
        connectedImage,
        drawPreview,
        id,
        pushHistory,
        resetMaskToBlack,
        revokeOutputUrls,
        scheduleEmitOutputs,
        setCanvasCursor,
        syncHistoryState,
        updateNodeData,
    ])

    useEffect(() => {
        if (!connectedImage) return
        if (isDrawingRef.current) return
        setCanvasCursor(mode === 'eraser' ? 'cell' : 'crosshair')
    }, [connectedImage, mode, setCanvasCursor])

    useEffect(() => {
        return () => {
            if (emitRafRef.current !== null) {
                window.cancelAnimationFrame(emitRafRef.current)
                emitRafRef.current = null
            }
            revokeOutputUrls()
        }
    }, [revokeOutputUrls])

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!connectedImage) return
        const previewCanvas = previewCanvasRef.current
        if (!previewCanvas || previewCanvas.width === 0 || previewCanvas.height === 0) return

        const point = toCanvasPoint(event)
        if (!point) return

        event.preventDefault()
        previewCanvas.setPointerCapture(event.pointerId)

        isDrawingRef.current = true
        didDrawRef.current = false
        lastPointRef.current = point

        drawStroke(point, point)
        didDrawRef.current = true
        scheduleEmitOutputs()
    }, [connectedImage, drawStroke, scheduleEmitOutputs, toCanvasPoint])

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!connectedImage) return

        if (!isDrawingRef.current) {
            setCanvasCursor(mode === 'eraser' ? 'cell' : 'crosshair')
            return
        }

        const point = toCanvasPoint(event)
        const lastPoint = lastPointRef.current
        if (!point || !lastPoint) return

        drawStroke(lastPoint, point)
        lastPointRef.current = point
        didDrawRef.current = true
        scheduleEmitOutputs()
    }, [connectedImage, drawStroke, mode, scheduleEmitOutputs, setCanvasCursor, toCanvasPoint])

    const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const previewCanvas = previewCanvasRef.current
        if (previewCanvas?.hasPointerCapture(event.pointerId)) {
            previewCanvas.releasePointerCapture(event.pointerId)
        }

        if (!isDrawingRef.current) return

        isDrawingRef.current = false
        lastPointRef.current = null
        if (didDrawRef.current) {
            pushHistory()
            didDrawRef.current = false
        }
        setCanvasCursor(mode === 'eraser' ? 'cell' : 'crosshair')
    }, [mode, pushHistory, setCanvasCursor])

    const handleBrushSizeChange = (values: number[]) => {
        updateNodeData(id, { brushSize: clamp(Math.round(values[0] ?? brushSize), 1, 256) })
    }

    const handleOpacityChange = (values: number[]) => {
        const nextOpacity = clamp((values[0] ?? Math.round(opacity * 100)) / 100, 0, 1)
        updateNodeData(id, { opacity: nextOpacity })
    }

    const handleModeChange = (nextMode: PainterMode) => {
        updateNodeData(id, { mode: nextMode })
    }

    const handleBrushColorChange = (nextColor: string) => {
        updateNodeData(id, { brushColor: nextColor })
    }

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card
                className={`relative w-[380px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
                    }`}
            >
                <div className="p-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                <Paintbrush className="w-4 h-4 text-rose-500" />
                            </div>
                            <h3 className="font-semibold text-sm">Painter</h3>
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
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerEnd}
                            onPointerCancel={handlePointerEnd}
                            className={`${connectedImage ? '' : 'hidden'} w-full h-full touch-none`}
                        />
                        {!connectedImage && (
                            <div className="text-xs text-muted-foreground text-center p-4">
                                Connect an image source
                            </div>
                        )}
                        <canvas ref={baseCanvasRef} className="hidden" />
                        <canvas ref={paintCanvasRef} className="hidden" />
                        <canvas ref={maskCanvasRef} className="hidden" />
                    </div>

                    <div className="space-y-3 bg-muted/30 p-2 rounded-md">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant={mode === 'brush' ? 'secondary' : 'outline'}
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => handleModeChange('brush')}
                                >
                                    <Brush className="w-3.5 h-3.5 mr-1" />
                                    Brush
                                </Button>
                                <Button
                                    variant={mode === 'eraser' ? 'secondary' : 'outline'}
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => handleModeChange('eraser')}
                                >
                                    <Eraser className="w-3.5 h-3.5 mr-1" />
                                    Eraser
                                </Button>
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearPaintLayers}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Clear
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handleUndo}
                                disabled={!historyState.canUndo}
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handleRedo}
                                disabled={!historyState.canRedo}
                            >
                                <Redo2 className="w-3.5 h-3.5" />
                            </Button>
                            <div className="text-[11px] text-muted-foreground">
                                Undo / Redo
                            </div>
                        </div>

                        <div className="grid grid-cols-[28px_1fr_68px] items-center gap-2">
                            <input
                                type="color"
                                value={brushColor}
                                onChange={(event) => handleBrushColorChange(event.target.value)}
                                className="h-8 w-8 rounded border border-border bg-transparent p-1"
                                disabled={mode === 'eraser'}
                            />
                            <Input
                                value={brushColor}
                                onChange={(event) => handleBrushColorChange(event.target.value)}
                                className="h-8 text-xs uppercase"
                                disabled={mode === 'eraser'}
                            />
                            <div className="text-xs text-muted-foreground text-right">
                                Color
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs">Opacity</Label>
                                <span className="text-xs text-muted-foreground">{Math.round(opacity * 100)}%</span>
                            </div>
                            <Slider
                                value={[Math.round(opacity * 100)]}
                                min={0}
                                max={100}
                                step={1}
                                onValueChange={handleOpacityChange}
                                disabled={mode === 'eraser'}
                                className="py-1"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs">Size</Label>
                                <span className="text-xs text-muted-foreground">{brushSize}px</span>
                            </div>
                            <Slider
                                value={[brushSize]}
                                min={1}
                                max={256}
                                step={1}
                                onValueChange={handleBrushSizeChange}
                                className="py-1"
                            />
                        </div>
                    </div>
                </div>

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
                    style={{ top: '44%' }}
                >
                    Result
                </div>
                <Handle
                    type="source"
                    position={Position.Right}
                    id={TOOL_OUTPUT_HANDLE_IDS.painterResult}
                    className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
                    style={{ top: '44%' }}
                />

                <div
                    className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-lime-300"
                    style={{ top: '62%' }}
                >
                    Mask
                </div>
                <Handle
                    type="source"
                    position={Position.Right}
                    id={TOOL_OUTPUT_HANDLE_IDS.painterMask}
                    className="!w-3 !h-3 !border-2 !bg-lime-400 !border-lime-200"
                    style={{ top: '62%' }}
                />
            </Card>
        </NodeContextMenu>
    )
})

PainterNode.displayName = 'PainterNode'
