"use client"

import React, { memo, useRef, useEffect, useCallback, useMemo } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MoreVertical, Crop as CropIcon, Link2, Unlink2 } from 'lucide-react'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'

const DEFAULT_CROP = {
    aspectRatio: 'free',
    cropWidth: 0,
    cropHeight: 0,
    lockAspect: true,
}

type CropRect = {
    x: number
    y: number
    width: number
    height: number
}

type ResizeMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type InteractionState = {
    mode: ResizeMode
    startPointer: { x: number; y: number }
    startRect: CropRect
    sourceWidth: number
    sourceHeight: number
    ratio: number | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

const getOptionalNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

const parseAspectRatio = (aspect: string): number | null => {
    if (!aspect || aspect === 'free') return null
    const [w, h] = aspect.split(':').map(Number)
    if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return null
    return w / h
}

const constrainRect = (rect: CropRect, sourceWidth: number, sourceHeight: number): CropRect => {
    const width = clamp(Math.round(rect.width), 1, sourceWidth)
    const height = clamp(Math.round(rect.height), 1, sourceHeight)
    const x = clamp(Math.round(rect.x), 0, sourceWidth - width)
    const y = clamp(Math.round(rect.y), 0, sourceHeight - height)
    return { x, y, width, height }
}

const cursorForMode = (mode: ResizeMode | null, dragging: boolean): string => {
    if (!mode) return 'default'
    if (mode === 'move') return dragging ? 'grabbing' : 'grab'
    if (mode === 'n' || mode === 's') return 'ns-resize'
    if (mode === 'e' || mode === 'w') return 'ew-resize'
    if (mode === 'ne' || mode === 'sw') return 'nesw-resize'
    return 'nwse-resize'
}

export const CropNode = memo(({ data, selected, id }: NodeProps) => {
    const { updateNodeData } = useReactFlow()

    const previewCanvasRef = useRef<HTMLCanvasElement>(null)
    const processingCanvasRef = useRef<HTMLCanvasElement>(null)
    const latestImageOutputRef = useRef<string | null>(null)
    const outputObjectUrlRef = useRef<string | null>(null)
    const mediaSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 })
    const interactionRef = useRef<InteractionState | null>(null)
    const pointerUpHandlerRef = useRef<((event: PointerEvent) => void) | null>(null)

    const connectedImage = data.connectedImage as string | undefined

    const aspectRatio = (data.aspectRatio as string | undefined) || DEFAULT_CROP.aspectRatio
    const cropX = getOptionalNumber(data.cropX)
    const cropY = getOptionalNumber(data.cropY)
    const cropWidth = getNumber(data.cropWidth, DEFAULT_CROP.cropWidth)
    const cropHeight = getNumber(data.cropHeight, DEFAULT_CROP.cropHeight)
    const lockAspect = (data.lockAspect as boolean | undefined) ?? DEFAULT_CROP.lockAspect

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

    const getCurrentOutput = useCallback(() => {
        if (latestImageOutputRef.current) return latestImageOutputRef.current
        return null
    }, [])

    useEffect(() => {
        return () => {
            revokeOutputUrl()
        }
    }, [revokeOutputUrl])

    useEffect(() => {
        const requiredKeys = ['aspectRatio', 'cropWidth', 'cropHeight', 'lockAspect'] as const
        const hasMissingDefaults = requiredKeys.some((key) => data[key] === undefined)
        if (hasMissingDefaults) {
            updateNodeData(id, { ...DEFAULT_CROP })
        }
    }, [data, id, updateNodeData])

    const getCropRect = useCallback((sourceWidth: number, sourceHeight: number): CropRect => {
        const ratio = parseAspectRatio(aspectRatio)

        const safeSourceWidth = Math.max(1, Math.floor(sourceWidth))
        const safeSourceHeight = Math.max(1, Math.floor(sourceHeight))

        let width = cropWidth > 0 ? Math.floor(cropWidth) : safeSourceWidth
        let height = cropHeight > 0 ? Math.floor(cropHeight) : safeSourceHeight

        width = clamp(width, 1, safeSourceWidth)
        height = clamp(height, 1, safeSourceHeight)

        if (ratio) {
            const widthFromHeight = Math.round(height * ratio)
            const heightFromWidth = Math.round(width / ratio)
            if (widthFromHeight <= safeSourceWidth) {
                width = widthFromHeight
            } else {
                height = heightFromWidth
            }
            width = clamp(width, 1, safeSourceWidth)
            height = clamp(height, 1, safeSourceHeight)
        }

        const x = cropX !== null ? cropX : Math.floor((safeSourceWidth - width) / 2)
        const y = cropY !== null ? cropY : Math.floor((safeSourceHeight - height) / 2)

        return constrainRect({ x, y, width, height }, safeSourceWidth, safeSourceHeight)
    }, [aspectRatio, cropHeight, cropWidth, cropX, cropY])

    const drawPreviewAndProcessing = useCallback((img: HTMLImageElement, sourceWidth: number, sourceHeight: number) => {
        const previewCanvas = previewCanvasRef.current
        const processingCanvas = processingCanvasRef.current
        if (!previewCanvas || !processingCanvas) return null

        const previewCtx = previewCanvas.getContext('2d')
        const processingCtx = processingCanvas.getContext('2d')
        if (!previewCtx || !processingCtx) return null

        const cropRect = getCropRect(sourceWidth, sourceHeight)

        if (previewCanvas.width !== sourceWidth) previewCanvas.width = sourceWidth
        if (previewCanvas.height !== sourceHeight) previewCanvas.height = sourceHeight

        previewCtx.clearRect(0, 0, sourceWidth, sourceHeight)
        previewCtx.drawImage(img, 0, 0, sourceWidth, sourceHeight)
        previewCtx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        previewCtx.fillRect(0, 0, sourceWidth, sourceHeight)

        previewCtx.drawImage(
            img,
            cropRect.x,
            cropRect.y,
            cropRect.width,
            cropRect.height,
            cropRect.x,
            cropRect.y,
            cropRect.width,
            cropRect.height
        )

        previewCtx.save()
        previewCtx.lineJoin = 'round'
        previewCtx.shadowColor = 'rgba(0, 0, 0, 0.5)'
        previewCtx.shadowBlur = 6
        previewCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
        previewCtx.lineWidth = 4
        previewCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height)
        previewCtx.shadowBlur = 0
        previewCtx.strokeStyle = '#f5ff7a'
        previewCtx.lineWidth = 2
        previewCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height)
        previewCtx.restore()

        previewCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
        previewCtx.lineWidth = 1
        previewCtx.setLineDash([6, 5])
        const thirdW = cropRect.width / 3
        const thirdH = cropRect.height / 3
        for (let i = 1; i < 3; i++) {
            const vx = cropRect.x + thirdW * i
            previewCtx.beginPath()
            previewCtx.moveTo(vx, cropRect.y)
            previewCtx.lineTo(vx, cropRect.y + cropRect.height)
            previewCtx.stroke()

            const hy = cropRect.y + thirdH * i
            previewCtx.beginPath()
            previewCtx.moveTo(cropRect.x, hy)
            previewCtx.lineTo(cropRect.x + cropRect.width, hy)
            previewCtx.stroke()
        }
        previewCtx.setLineDash([])

        const hs = 10
        const half = hs / 2
        const handlePositions = [
            { x: cropRect.x, y: cropRect.y },
            { x: cropRect.x + cropRect.width, y: cropRect.y },
            { x: cropRect.x, y: cropRect.y + cropRect.height },
            { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
            { x: cropRect.x + cropRect.width / 2, y: cropRect.y },
            { x: cropRect.x + cropRect.width / 2, y: cropRect.y + cropRect.height },
            { x: cropRect.x, y: cropRect.y + cropRect.height / 2 },
            { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height / 2 },
        ]
        previewCtx.fillStyle = '#ffffff'
        previewCtx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
        previewCtx.lineWidth = 1
        handlePositions.forEach((pos) => {
            previewCtx.fillRect(pos.x - half, pos.y - half, hs, hs)
            previewCtx.strokeRect(pos.x - half, pos.y - half, hs, hs)
        })

        if (processingCanvas.width !== cropRect.width) processingCanvas.width = cropRect.width
        if (processingCanvas.height !== cropRect.height) processingCanvas.height = cropRect.height
        processingCtx.clearRect(0, 0, cropRect.width, cropRect.height)
        processingCtx.drawImage(
            img,
            cropRect.x,
            cropRect.y,
            cropRect.width,
            cropRect.height,
            0,
            0,
            cropRect.width,
            cropRect.height
        )

        return cropRect
    }, [getCropRect])

    const toCanvasPoint = useCallback((event: PointerEvent | React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width) * canvas.width
        const y = ((event.clientY - rect.top) / rect.height) * canvas.height
        return { x, y }
    }, [])

    const hitTestMode = useCallback((point: { x: number; y: number }, rect: CropRect): ResizeMode | null => {
        const threshold = 10
        const left = rect.x
        const right = rect.x + rect.width
        const top = rect.y
        const bottom = rect.y + rect.height

        const nearLeft = Math.abs(point.x - left) <= threshold
        const nearRight = Math.abs(point.x - right) <= threshold
        const nearTop = Math.abs(point.y - top) <= threshold
        const nearBottom = Math.abs(point.y - bottom) <= threshold

        if (nearLeft && nearTop) return 'nw'
        if (nearRight && nearTop) return 'ne'
        if (nearLeft && nearBottom) return 'sw'
        if (nearRight && nearBottom) return 'se'
        if (nearLeft) return 'w'
        if (nearRight) return 'e'
        if (nearTop) return 'n'
        if (nearBottom) return 's'

        const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
        if (inside) return 'move'

        return null
    }, [])

    const setCanvasCursor = useCallback((mode: ResizeMode | null, dragging: boolean) => {
        const canvas = previewCanvasRef.current
        if (!canvas) return
        canvas.style.cursor = cursorForMode(mode, dragging)
    }, [])

    const applyInteraction = useCallback((interaction: InteractionState, dx: number, dy: number): CropRect => {
        const mode = interaction.mode
        const start = interaction.startRect

        if (mode === 'move') {
            return constrainRect({
                x: start.x + dx,
                y: start.y + dy,
                width: start.width,
                height: start.height,
            }, interaction.sourceWidth, interaction.sourceHeight)
        }

        let left = start.x
        let right = start.x + start.width
        let top = start.y
        let bottom = start.y + start.height

        if (mode.includes('w')) left += dx
        if (mode.includes('e')) right += dx
        if (mode.includes('n')) top += dy
        if (mode.includes('s')) bottom += dy

        if (right - left < 1) {
            if (mode.includes('w')) left = right - 1
            else right = left + 1
        }
        if (bottom - top < 1) {
            if (mode.includes('n')) top = bottom - 1
            else bottom = top + 1
        }

        let width = right - left
        let height = bottom - top

        if (interaction.ratio) {
            const ratio = interaction.ratio
            if (mode === 'n' || mode === 's') {
                width = height * ratio
            } else if (mode === 'e' || mode === 'w') {
                height = width / ratio
            } else {
                const heightFromWidth = width / ratio
                const widthFromHeight = height * ratio
                if (Math.abs(heightFromWidth - height) < Math.abs(widthFromHeight - width)) {
                    height = heightFromWidth
                } else {
                    width = widthFromHeight
                }
            }

            const startLeft = start.x
            const startRight = start.x + start.width
            const startTop = start.y
            const startBottom = start.y + start.height
            const startCenterX = start.x + start.width / 2
            const startCenterY = start.y + start.height / 2

            if (mode.includes('w') && !mode.includes('e')) {
                left = startRight - width
                right = startRight
            } else if (mode.includes('e') && !mode.includes('w')) {
                left = startLeft
                right = startLeft + width
            } else {
                left = startCenterX - width / 2
                right = startCenterX + width / 2
            }

            if (mode.includes('n') && !mode.includes('s')) {
                top = startBottom - height
                bottom = startBottom
            } else if (mode.includes('s') && !mode.includes('n')) {
                top = startTop
                bottom = startTop + height
            } else {
                top = startCenterY - height / 2
                bottom = startCenterY + height / 2
            }
        }

        return constrainRect({
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        }, interaction.sourceWidth, interaction.sourceHeight)
    }, [])

    const handleGlobalPointerMove = useCallback((event: PointerEvent) => {
        const interaction = interactionRef.current
        const canvas = previewCanvasRef.current
        if (!interaction || !canvas) return

        const point = toCanvasPoint(event, canvas)
        const dx = point.x - interaction.startPointer.x
        const dy = point.y - interaction.startPointer.y

        const nextRect = applyInteraction(interaction, dx, dy)
        setCanvasCursor(interaction.mode, true)
        updateNodeData(id, {
            cropX: nextRect.x,
            cropY: nextRect.y,
            cropWidth: nextRect.width,
            cropHeight: nextRect.height,
        })
    }, [applyInteraction, id, setCanvasCursor, toCanvasPoint, updateNodeData])

    const clearPointerListeners = useCallback(() => {
        window.removeEventListener('pointermove', handleGlobalPointerMove)
        if (pointerUpHandlerRef.current) {
            window.removeEventListener('pointerup', pointerUpHandlerRef.current)
            pointerUpHandlerRef.current = null
        }
    }, [handleGlobalPointerMove])

    useEffect(() => {
        if (!connectedImage) {
            clearPointerListeners()
            interactionRef.current = null
            setCanvasCursor(null, false)
            mediaSizeRef.current = { width: 0, height: 0 }
            clearCanvases()
            revokeOutputUrl()
            latestImageOutputRef.current = null
            updateNodeData(id, {
                getOutput: null,
                output: null,
                imageOutput: null,
                cropRect: null,
            })
            return
        }

        let cancelled = false
        const img = new Image()
        img.crossOrigin = 'Anonymous'

        const render = () => {
            if (cancelled) return
            mediaSizeRef.current = { width: img.width, height: img.height }
            const cropRect = drawPreviewAndProcessing(img, img.width, img.height)
            if (!cropRect) return

            const processingCanvas = processingCanvasRef.current
            if (!processingCanvas) return

            processingCanvas.toBlob((blob) => {
                if (cancelled) return
                if (!blob) {
                    latestImageOutputRef.current = null
                    updateNodeData(id, { getOutput: getCurrentOutput, output: null, imageOutput: null, cropRect })
                    return
                }

                revokeOutputUrl()
                const runtimeUrl = URL.createObjectURL(blob)
                outputObjectUrlRef.current = runtimeUrl
                latestImageOutputRef.current = runtimeUrl
                updateNodeData(id, {
                    getOutput: getCurrentOutput,
                    output: runtimeUrl,
                    imageOutput: runtimeUrl,
                    cropRect,
                })
            }, 'image/png')
        }

        img.onload = render
        img.onerror = () => {
            if (cancelled) return
            mediaSizeRef.current = { width: 0, height: 0 }
            clearCanvases()
            revokeOutputUrl()
            latestImageOutputRef.current = null
            setCanvasCursor(null, false)
            updateNodeData(id, {
                getOutput: null,
                output: null,
                imageOutput: null,
                cropRect: null,
            })
        }
        img.src = connectedImage
        if (img.complete) render()

        return () => {
            cancelled = true
        }
    }, [connectedImage, clearCanvases, clearPointerListeners, drawPreviewAndProcessing, getCurrentOutput, id, revokeOutputUrl, setCanvasCursor, updateNodeData])

    useEffect(() => {
        const sourceW = mediaSizeRef.current.width
        const sourceH = mediaSizeRef.current.height
        if (!sourceW || !sourceH) return

        const normalized = getCropRect(sourceW, sourceH)
        const changed =
            cropX !== normalized.x ||
            cropY !== normalized.y ||
            cropWidth !== normalized.width ||
            cropHeight !== normalized.height

        if (changed) {
            updateNodeData(id, {
                cropX: normalized.x,
                cropY: normalized.y,
                cropWidth: normalized.width,
                cropHeight: normalized.height,
            })
        }
    }, [cropX, cropY, cropWidth, cropHeight, getCropRect, id, updateNodeData])

    const aspectOptions = useMemo(() => ([
        { value: 'free', label: 'Free' },
        { value: '1:1', label: '1:1' },
        { value: '4:3', label: '4:3' },
        { value: '3:4', label: '3:4' },
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
    ]), [])

    const applyDimensions = useCallback((nextWidth: number, nextHeight: number) => {
        const sourceW = Math.max(1, mediaSizeRef.current.width || nextWidth || 1)
        const sourceH = Math.max(1, mediaSizeRef.current.height || nextHeight || 1)
        const current = getCropRect(sourceW, sourceH)

        const width = clamp(Math.round(nextWidth), 1, sourceW)
        const height = clamp(Math.round(nextHeight), 1, sourceH)
        const centerX = current.x + current.width / 2
        const centerY = current.y + current.height / 2

        const x = clamp(Math.round(centerX - width / 2), 0, sourceW - width)
        const y = clamp(Math.round(centerY - height / 2), 0, sourceH - height)

        updateNodeData(id, {
            cropX: x,
            cropY: y,
            cropWidth: width,
            cropHeight: height,
        })
    }, [getCropRect, id, updateNodeData])

    const handleAspectRatioChange = (value: string) => {
        const ratio = parseAspectRatio(value)
        const sourceW = Math.max(1, mediaSizeRef.current.width || cropWidth || 1)
        const sourceH = Math.max(1, mediaSizeRef.current.height || cropHeight || 1)
        const current = getCropRect(sourceW, sourceH)

        let nextWidth = current.width
        let nextHeight = current.height

        if (ratio) {
            nextHeight = Math.round(nextWidth / ratio)
            if (nextHeight > sourceH) {
                nextHeight = sourceH
                nextWidth = Math.round(nextHeight * ratio)
            }
        }

        const centerX = current.x + current.width / 2
        const centerY = current.y + current.height / 2

        nextWidth = clamp(nextWidth, 1, sourceW)
        nextHeight = clamp(nextHeight, 1, sourceH)

        updateNodeData(id, {
            aspectRatio: value,
            cropWidth: nextWidth,
            cropHeight: nextHeight,
            cropX: clamp(Math.round(centerX - nextWidth / 2), 0, sourceW - nextWidth),
            cropY: clamp(Math.round(centerY - nextHeight / 2), 0, sourceH - nextHeight),
        })
    }

    const handleWidthChange = (raw: string) => {
        const parsed = Number(raw)
        if (Number.isNaN(parsed)) return

        const sourceW = Math.max(1, mediaSizeRef.current.width || parsed)
        const sourceH = Math.max(1, mediaSizeRef.current.height || cropHeight || parsed)
        let nextWidth = clamp(Math.round(parsed), 1, sourceW)
        let nextHeight = cropHeight > 0 ? cropHeight : sourceH

        const ratio = parseAspectRatio(aspectRatio)
        if (lockAspect && ratio) {
            nextHeight = Math.round(nextWidth / ratio)
            if (nextHeight > sourceH) {
                nextHeight = sourceH
                nextWidth = Math.round(nextHeight * ratio)
            }
        }

        applyDimensions(nextWidth, nextHeight)
    }

    const handleHeightChange = (raw: string) => {
        const parsed = Number(raw)
        if (Number.isNaN(parsed)) return

        const sourceW = Math.max(1, mediaSizeRef.current.width || cropWidth || parsed)
        const sourceH = Math.max(1, mediaSizeRef.current.height || parsed)
        let nextHeight = clamp(Math.round(parsed), 1, sourceH)
        let nextWidth = cropWidth > 0 ? cropWidth : sourceW

        const ratio = parseAspectRatio(aspectRatio)
        if (lockAspect && ratio) {
            nextWidth = Math.round(nextHeight * ratio)
            if (nextWidth > sourceW) {
                nextWidth = sourceW
                nextHeight = Math.round(nextWidth / ratio)
            }
        }

        applyDimensions(nextWidth, nextHeight)
    }

    const handleReset = () => {
        const sourceW = Math.max(1, mediaSizeRef.current.width || 1)
        const sourceH = Math.max(1, mediaSizeRef.current.height || 1)
        updateNodeData(id, {
            aspectRatio: 'free',
            lockAspect: true,
            cropX: 0,
            cropY: 0,
            cropWidth: sourceW,
            cropHeight: sourceH,
        })
    }

    const handleCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = previewCanvasRef.current
        if (!canvas || interactionRef.current) return

        const sourceW = canvas.width
        const sourceH = canvas.height
        if (!sourceW || !sourceH) {
            setCanvasCursor(null, false)
            return
        }

        const point = toCanvasPoint(event, canvas)
        const rect = getCropRect(sourceW, sourceH)
        const mode = hitTestMode(point, rect)
        setCanvasCursor(mode, false)
    }, [getCropRect, hitTestMode, setCanvasCursor, toCanvasPoint])

    const handleCanvasPointerLeave = useCallback(() => {
        if (!interactionRef.current) {
            setCanvasCursor(null, false)
        }
    }, [setCanvasCursor])

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = previewCanvasRef.current
        if (!canvas || !connectedImage) return

        const sourceWidth = canvas.width
        const sourceHeight = canvas.height
        if (!sourceWidth || !sourceHeight) return

        const point = toCanvasPoint(event, canvas)
        const rect = getCropRect(sourceWidth, sourceHeight)
        const mode = hitTestMode(point, rect)
        if (!mode) return

        event.preventDefault()
        canvas.setPointerCapture(event.pointerId)

        const ratio = lockAspect ? (parseAspectRatio(aspectRatio) ?? rect.width / Math.max(1, rect.height)) : null
        interactionRef.current = {
            mode,
            startPointer: point,
            startRect: rect,
            sourceWidth,
            sourceHeight,
            ratio,
        }
        setCanvasCursor(mode, true)

        const onPointerUp = (upEvent: PointerEvent) => {
            const currentCanvas = previewCanvasRef.current
            interactionRef.current = null
            clearPointerListeners()

            if (currentCanvas) {
                const upPoint = toCanvasPoint(upEvent, currentCanvas)
                const currentRect = getCropRect(currentCanvas.width, currentCanvas.height)
                const upMode = hitTestMode(upPoint, currentRect)
                setCanvasCursor(upMode, false)
            } else {
                setCanvasCursor(null, false)
            }
        }
        pointerUpHandlerRef.current = onPointerUp

        window.addEventListener('pointermove', handleGlobalPointerMove)
        window.addEventListener('pointerup', onPointerUp)
    }, [aspectRatio, clearPointerListeners, connectedImage, getCropRect, handleGlobalPointerMove, hitTestMode, lockAspect, setCanvasCursor, toCanvasPoint])

    useEffect(() => {
        return () => {
            clearPointerListeners()
            interactionRef.current = null
        }
    }, [clearPointerListeners])

    const displayWidth = cropWidth > 0 ? cropWidth : ''
    const displayHeight = cropHeight > 0 ? cropHeight : ''

    return (
        <NodeContextMenu nodeId={id} type="context">
            <Card
                className={`relative w-[360px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
                    }`}
            >
                <div className="p-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-lime-500/10 flex items-center justify-center">
                                <CropIcon className="w-4 h-4 text-lime-500" />
                            </div>
                            <h3 className="font-semibold text-sm">Crop</h3>
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
                            onPointerMove={handleCanvasPointerMove}
                            onPointerLeave={handleCanvasPointerLeave}
                            className={`${connectedImage ? '' : 'hidden'} w-full h-full object-contain touch-none`}
                        />
                        {!connectedImage && (
                            <div className="text-xs text-muted-foreground text-center p-4">
                                Connect an image source
                            </div>
                        )}
                        <canvas ref={processingCanvasRef} className="hidden" />
                    </div>

                    <div className="space-y-3 bg-muted/30 p-2 rounded-md">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                                <Label className="text-xs">Aspect Ratio</Label>
                                <Select value={aspectRatio} onValueChange={handleAspectRatioChange}>
                                    <SelectTrigger className="h-8 text-xs mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {aspectOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs mt-5" onClick={handleReset}>
                                Reset
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs">Dimensions</Label>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => updateNodeData(id, { lockAspect: !lockAspect })}
                                >
                                    {lockAspect ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    type="number"
                                    value={displayWidth}
                                    onChange={(e) => handleWidthChange(e.target.value)}
                                    className="h-8 text-xs"
                                    placeholder="W"
                                    min={1}
                                />
                                <Input
                                    type="number"
                                    value={displayHeight}
                                    onChange={(e) => handleHeightChange(e.target.value)}
                                    className="h-8 text-xs"
                                    placeholder="H"
                                    min={1}
                                />
                            </div>
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

CropNode.displayName = 'CropNode'
