"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FlipHorizontal2, FlipVertical2, GripVertical, Layers, Move, PencilLine, Plus, SquareDashedMousePointer, X } from 'lucide-react'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'

type BlendModeOption =
  | 'none'
  | 'source-over'
  | 'lighter'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

type EditorLayer = {
  id: string
  name: string
  source: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipX: boolean
  flipY: boolean
  opacity: number
  blendMode: BlendModeOption
  visible: boolean
}

type CachedImage = {
  src: string
  image: HTMLImageElement
  loaded: boolean
  error: boolean
}

type DragMode = 'drag' | 'resize'
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

type InteractionState = {
  mode: DragMode
  layerId: string
  startX: number
  startY: number
  original: EditorLayer
  handle?: ResizeHandle
}

const DEFAULT_CANVAS_WIDTH = 960
const DEFAULT_CANVAS_HEIGHT = 960
const DEFAULT_LAYER_COUNT = 2
const DEFAULT_BACKGROUND_COLOR = 'transparent'
const MIN_LAYER_SIZE = 24
const HANDLE_HIT_RADIUS = 10

const BLEND_MODE_OPTIONS: { value: BlendModeOption; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'source-over', label: 'Normal' },
  { value: 'lighter', label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const getStringField = (value: unknown): string => (typeof value === 'string' ? value : '')
const getNumberField = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const isBlendMode = (value: unknown): value is BlendModeOption =>
  value === 'none' ||
  value === 'source-over' ||
  value === 'lighter' ||
  value === 'multiply' ||
  value === 'screen' ||
  value === 'overlay' ||
  value === 'darken' ||
  value === 'lighten' ||
  value === 'color-dodge' ||
  value === 'color-burn' ||
  value === 'hard-light' ||
  value === 'soft-light' ||
  value === 'difference' ||
  value === 'exclusion' ||
  value === 'hue' ||
  value === 'saturation' ||
  value === 'color' ||
  value === 'luminosity'

function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number, size = 24) {
  ctx.fillStyle = '#2d2f38'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#3a3d47'
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if (((x / size) + (y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size)
      }
    }
  }
}

const buildLayerDefaults = (index: number, canvasWidth: number, canvasHeight: number): Omit<EditorLayer, 'id' | 'name' | 'source'> => {
  const size = Math.round(Math.min(canvasWidth, canvasHeight) * 0.35)
  const offset = index * 28
  return {
    x: Math.round(canvasWidth * 0.5 - size * 0.5 + offset),
    y: Math.round(canvasHeight * 0.5 - size * 0.5 + offset),
    width: size,
    height: size,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    blendMode: 'none',
    visible: true,
  }
}

function normalizePersistedLayer(value: unknown): Partial<EditorLayer> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const layer = value as Record<string, unknown>
  return {
    id: getStringField(layer.id),
    name: getStringField(layer.name),
    source: getStringField(layer.source),
    x: getNumberField(layer.x, 0),
    y: getNumberField(layer.y, 0),
    width: getNumberField(layer.width, 0),
    height: getNumberField(layer.height, 0),
    rotation: getNumberField(layer.rotation, 0),
    flipX: Boolean(layer.flipX),
    flipY: Boolean(layer.flipY),
    opacity: clamp(getNumberField(layer.opacity, 1), 0, 1),
    blendMode: isBlendMode(layer.blendMode) ? layer.blendMode : 'source-over',
    visible: layer.visible === undefined ? true : Boolean(layer.visible),
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })

const resizeHandleToCursor = (handle: ResizeHandle): string =>
  handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize'

function reorderByIds<T extends { id: string }>(items: T[], fromId: string, toId: string): T[] {
  const fromIndex = items.findIndex((item) => item.id === fromId)
  const toIndex = items.findIndex((item) => item.id === toId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return items
  next.splice(toIndex, 0, moved)
  return next
}

export const ImageCompositorNode = memo(({ data, selected, id }: NodeProps) => {
  const { updateNodeData } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()

  const outputUrlRef = useRef<string | null>(null)
  const imageCacheRef = useRef<Record<string, CachedImage>>({})
  const compositionCanvasRef = useRef<HTMLCanvasElement>(null)
  const editorCanvasRef = useRef<HTMLCanvasElement>(null)
  const interactionRef = useRef<InteractionState | null>(null)
  const exportVersionRef = useRef(0)

  const [imageVersion, setImageVersion] = useState(0)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [selectedLayerId, setSelectedLayerId] = useState('layer_0')
  const [draggingLayerId, setDraggingLayerId] = useState('')
  const [canvasCursor, setCanvasCursor] = useState('default')

  const canvasWidth = clamp(Math.round(getNumberField(data?.canvasWidth, DEFAULT_CANVAS_WIDTH)), 128, 4096)
  const canvasHeight = clamp(Math.round(getNumberField(data?.canvasHeight, DEFAULT_CANVAS_HEIGHT)), 128, 4096)
  const layerCount = Math.max(1, Math.round(getNumberField(data?.layerCount, DEFAULT_LAYER_COUNT)))
  const connectedBackground = getStringField(data?.connectedBackground)
  const rawBackgroundColor = getStringField(data?.backgroundColor).trim()
  const backgroundColor = rawBackgroundColor || DEFAULT_BACKGROUND_COLOR
  const isBackgroundTransparent = backgroundColor.toLowerCase() === 'transparent'
  const backgroundColorPickerValue =
    /^#[0-9a-fA-F]{6}$/.test(backgroundColor)
      ? backgroundColor
      : '#000000'
  const defaultLayerIds = useMemo(
    () => Array.from({ length: layerCount }, (_, index) => `layer_${index}`),
    [layerCount]
  )
  const layerOrder = useMemo(() => {
    const persisted = Array.isArray(data?.layerOrder)
      ? data.layerOrder.filter((value): value is string => typeof value === 'string')
      : []
    const uniquePersisted = persisted.filter(
      (value, index) => defaultLayerIds.includes(value) && persisted.indexOf(value) === index
    )
    const missing = defaultLayerIds.filter((idValue) => !uniquePersisted.includes(idValue))
    return [...uniquePersisted, ...missing]
  }, [data, defaultLayerIds])

  const connectedLayerSources = useMemo(
    () =>
      Array.from({ length: layerCount }, (_, index) =>
        getStringField((data as Record<string, unknown> | undefined)?.[`connectedImage_${index}`])
      ),
    [data, layerCount]
  )
  const layers = useMemo<EditorLayer[]>(() => {
    const persistedRaw = Array.isArray(data?.layers) ? data.layers : []
    const persisted = persistedRaw.map(normalizePersistedLayer)

    return layerOrder.map((idValue) => {
      const index = Math.max(0, Number(idValue.split('_')[1] || 0))
      const fromPersisted = persisted.find((layer) => layer.id === idValue)
      const defaults = buildLayerDefaults(index, canvasWidth, canvasHeight)
      const source = connectedLayerSources[index] || ''

      const layer: EditorLayer = {
        ...defaults,
        ...(fromPersisted as Partial<EditorLayer>),
        id: idValue,
        name: `Layer ${index + 1}`,
        source,
      }

      layer.width = clamp(Math.round(layer.width || defaults.width), MIN_LAYER_SIZE, 4096)
      layer.height = clamp(Math.round(layer.height || defaults.height), MIN_LAYER_SIZE, 4096)
      layer.opacity = clamp(layer.opacity, 0, 1)
      layer.blendMode = isBlendMode(layer.blendMode) ? layer.blendMode : 'source-over'

      return layer
    })
  }, [canvasHeight, canvasWidth, connectedLayerSources, data, layerOrder])

  const effectiveSelectedLayerId = layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : layers[0]?.id || 'layer_0'
  const selectedLayer = layers.find((layer) => layer.id === effectiveSelectedLayerId) || null
  const output = getStringField(data?.output)
  const compositionSignature = useMemo(
    () =>
      JSON.stringify({
        width: canvasWidth,
        height: canvasHeight,
        background: connectedBackground,
        backgroundColor,
        layers: layers.map((layer) => ({
          id: layer.id,
          source: layer.source,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation,
          flipX: layer.flipX,
          flipY: layer.flipY,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          visible: layer.visible,
        })),
      }),
    [backgroundColor, canvasHeight, canvasWidth, connectedBackground, layers]
  )

  const layersRef = useRef<EditorLayer[]>(layers)
  const selectedLayerRef = useRef<EditorLayer | null>(selectedLayer)
  const connectedBackgroundRef = useRef(connectedBackground)
  const backgroundColorRef = useRef(backgroundColor)

  const revokeOutput = useCallback(() => {
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current)
      outputUrlRef.current = null
    }
  }, [])

  const ensureImageCached = useCallback((key: string, source: string) => {
    const existing = imageCacheRef.current[key]
    if (existing && existing.src === source) return

    const image = new Image()
    image.crossOrigin = 'anonymous'
    const entry: CachedImage = {
      src: source,
      image,
      loaded: false,
      error: false,
    }
    imageCacheRef.current[key] = entry

    image.onload = () => {
      entry.loaded = true
      setImageVersion((value) => value + 1)
    }
    image.onerror = () => {
      entry.error = true
      setImageVersion((value) => value + 1)
    }
    image.src = source
  }, [])

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, layerCount, updateNodeInternals])

  useEffect(() => {
    return () => {
      revokeOutput()
    }
  }, [revokeOutput])

  useEffect(() => {
    if (!isEditorOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditableTarget) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setIsEditorOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [isEditorOpen])

  useEffect(() => {
    layersRef.current = layers
    selectedLayerRef.current = selectedLayer
    connectedBackgroundRef.current = connectedBackground
    backgroundColorRef.current = backgroundColor
  }, [backgroundColor, connectedBackground, layers, selectedLayer])

  useEffect(() => {
    if (connectedBackground) {
      ensureImageCached('background', connectedBackground)
    } else {
      delete imageCacheRef.current.background
    }

    layers.forEach((layer) => {
      if (!layer.source) {
        delete imageCacheRef.current[layer.id]
        return
      }
      ensureImageCached(layer.id, layer.source)
    })
  }, [connectedBackground, ensureImageCached, layers])

  const drawComposition = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    includeSelection: boolean,
    showCheckerboard: boolean
  ) => {
      const layerState = layersRef.current
      const selectedLayerState = selectedLayerRef.current
      const backgroundSource = connectedBackgroundRef.current
      const fillBackgroundColor = backgroundColorRef.current
      const useTransparentBackground = fillBackgroundColor.toLowerCase() === 'transparent'

      ctx.clearRect(0, 0, width, height)
      if (showCheckerboard) {
        drawCheckerboard(ctx, width, height)
      }
      if (!useTransparentBackground) {
        try {
          ctx.fillStyle = fillBackgroundColor
          ctx.fillRect(0, 0, width, height)
        } catch {
          // Ignore invalid color values and keep transparent background.
        }
      }

      const drawFittedBackground = () => {
        const background = imageCacheRef.current.background
        if (!background || !background.loaded || background.error || !backgroundSource) return
        const img = background.image
        if (img.naturalWidth === 0 || img.naturalHeight === 0) return

        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight)
        const drawWidth = img.naturalWidth * scale
        const drawHeight = img.naturalHeight * scale
        const x = (width - drawWidth) / 2
        const y = (height - drawHeight) / 2
        ctx.drawImage(img, x, y, drawWidth, drawHeight)
      }

      drawFittedBackground()

      layerState.forEach((layer) => {
        if (!layer.visible || !layer.source) return
        const cached = imageCacheRef.current[layer.id]
        if (!cached || !cached.loaded || cached.error) return
        const image = cached.image

        const centerX = layer.x + layer.width / 2
        const centerY = layer.y + layer.height / 2
        const radians = (layer.rotation * Math.PI) / 180

        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(radians)
        ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1)
        ctx.globalAlpha = clamp(layer.opacity, 0, 1)
        ctx.globalCompositeOperation = layer.blendMode === 'none' ? 'source-over' : layer.blendMode
        ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
        ctx.restore()
      })

      if (!includeSelection || !selectedLayerState || !selectedLayerState.visible || !selectedLayerState.source) {
        return
      }

      const { x, y, width: layerWidth, height: layerHeight } = selectedLayerState
      ctx.save()
      ctx.strokeStyle = '#d9e08d'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.strokeRect(x, y, layerWidth, layerHeight)
      ctx.setLineDash([])

      const handles: Array<[number, number]> = [
        [x, y],
        [x + layerWidth, y],
        [x, y + layerHeight],
        [x + layerWidth, y + layerHeight],
      ]
      ctx.fillStyle = '#d9e08d'
      handles.forEach(([handleX, handleY]) => {
        ctx.fillRect(handleX - 4, handleY - 4, 8, 8)
      })
      ctx.restore()
    },
    []
  )

  const renderEditorCanvas = useCallback(() => {
    const canvas = editorCanvasRef.current
    if (!canvas) return
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const context = canvas.getContext('2d')
    if (!context) return
    drawComposition(context, canvasWidth, canvasHeight, true, true)
  }, [canvasHeight, canvasWidth, drawComposition])

  useEffect(() => {
    if (!isEditorOpen) return
    renderEditorCanvas()
  }, [canvasWidth, canvasHeight, compositionSignature, effectiveSelectedLayerId, imageVersion, isEditorOpen, renderEditorCanvas])

  useEffect(() => {
    const canvas = compositionCanvasRef.current
    if (!canvas) return

    canvas.width = canvasWidth
    canvas.height = canvasHeight

    const context = canvas.getContext('2d')
    if (!context) return

    drawComposition(context, canvasWidth, canvasHeight, false, false)

    const version = ++exportVersionRef.current
    void canvasToBlob(canvas).then((blob) => {
      if (version !== exportVersionRef.current) return
      if (!blob) return

      revokeOutput()
      const objectUrl = URL.createObjectURL(blob)
      outputUrlRef.current = objectUrl

      updateNodeData(id, {
        output: objectUrl,
        imageOutput: objectUrl,
      })
    })
  }, [canvasHeight, canvasWidth, compositionSignature, drawComposition, id, imageVersion, revokeOutput, updateNodeData])

  const persistLayers = useCallback((nextLayers: EditorLayer[]) => {
    updateNodeData(id, {
      layers: nextLayers,
      layerOrder: nextLayers.map((layer) => layer.id),
    })
  }, [id, updateNodeData])

  const updateLayer = useCallback((layerId: string, patch: Partial<EditorLayer>) => {
    const nextLayers = layers.map((layer) =>
      layer.id === layerId
        ? {
          ...layer,
          ...patch,
          width: patch.width !== undefined ? clamp(Math.round(patch.width), MIN_LAYER_SIZE, 4096) : layer.width,
          height: patch.height !== undefined ? clamp(Math.round(patch.height), MIN_LAYER_SIZE, 4096) : layer.height,
          opacity: patch.opacity !== undefined ? clamp(patch.opacity, 0, 1) : layer.opacity,
          blendMode: patch.blendMode !== undefined && isBlendMode(patch.blendMode) ? patch.blendMode : layer.blendMode,
        }
        : layer
    )
    persistLayers(nextLayers)
  }, [layers, persistLayers])

  const toCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = editorCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const detectResizeHandle = (layer: EditorLayer, pointX: number, pointY: number): ResizeHandle | null => {
    const points: Array<{ handle: ResizeHandle; x: number; y: number }> = [
      { handle: 'nw', x: layer.x, y: layer.y },
      { handle: 'ne', x: layer.x + layer.width, y: layer.y },
      { handle: 'sw', x: layer.x, y: layer.y + layer.height },
      { handle: 'se', x: layer.x + layer.width, y: layer.y + layer.height },
    ]

    for (const point of points) {
      if (Math.abs(pointX - point.x) <= HANDLE_HIT_RADIUS && Math.abs(pointY - point.y) <= HANDLE_HIT_RADIUS) {
        return point.handle
      }
    }
    return null
  }

  const findTopLayerAtPoint = (pointX: number, pointY: number): EditorLayer | null => {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index]
      if (!layer.visible || !layer.source) continue
      if (
        pointX >= layer.x &&
        pointX <= layer.x + layer.width &&
        pointY >= layer.y &&
        pointY <= layer.y + layer.height
      ) {
        return layer
      }
    }
    return null
  }

  const getCursorAtPoint = (pointX: number, pointY: number): string => {
    const selected = layers.find((layer) => layer.id === effectiveSelectedLayerId) || null
    if (selected) {
      const resizeHandle = detectResizeHandle(selected, pointX, pointY)
      if (resizeHandle) {
        return resizeHandleToCursor(resizeHandle)
      }
    }
    return findTopLayerAtPoint(pointX, pointY) ? 'grab' : 'default'
  }

  const handleEditorPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = editorCanvasRef.current
    if (!canvas) return
    const point = toCanvasPoint(event)
    if (!point) return

    const selected = layers.find((layer) => layer.id === effectiveSelectedLayerId) || null
    if (selected) {
      const resizeHandle = detectResizeHandle(selected, point.x, point.y)
      if (resizeHandle) {
        interactionRef.current = {
          mode: 'resize',
          layerId: selected.id,
          startX: point.x,
          startY: point.y,
          original: { ...selected },
          handle: resizeHandle,
        }
        setCanvasCursor(resizeHandleToCursor(resizeHandle))
        canvas.setPointerCapture(event.pointerId)
        event.preventDefault()
        return
      }
    }

    const hitLayer = findTopLayerAtPoint(point.x, point.y)
    if (hitLayer) {
      setSelectedLayerId(hitLayer.id)
      interactionRef.current = {
        mode: 'drag',
        layerId: hitLayer.id,
        startX: point.x,
        startY: point.y,
        original: { ...hitLayer },
      }
      setCanvasCursor('grabbing')
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }

    setCanvasCursor(getCursorAtPoint(point.x, point.y))
  }

  const handleEditorPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current
    const point = toCanvasPoint(event)
    if (!point) return
    if (!interaction) {
      setCanvasCursor(getCursorAtPoint(point.x, point.y))
      return
    }

    const dx = point.x - interaction.startX
    const dy = point.y - interaction.startY

    if (interaction.mode === 'drag') {
      setCanvasCursor('grabbing')
      updateLayer(interaction.layerId, {
        x: Math.round(interaction.original.x + dx),
        y: Math.round(interaction.original.y + dy),
      })
      return
    }

    const original = interaction.original
    let nextX = original.x
    let nextY = original.y
    let nextWidth = original.width
    let nextHeight = original.height

    switch (interaction.handle) {
      case 'nw':
        nextX = original.x + dx
        nextY = original.y + dy
        nextWidth = original.width - dx
        nextHeight = original.height - dy
        break
      case 'ne':
        nextY = original.y + dy
        nextWidth = original.width + dx
        nextHeight = original.height - dy
        break
      case 'sw':
        nextX = original.x + dx
        nextWidth = original.width - dx
        nextHeight = original.height + dy
        break
      case 'se':
        nextWidth = original.width + dx
        nextHeight = original.height + dy
        break
      default:
        break
    }

    if (nextWidth < MIN_LAYER_SIZE) {
      if (interaction.handle === 'nw' || interaction.handle === 'sw') {
        nextX -= MIN_LAYER_SIZE - nextWidth
      }
      nextWidth = MIN_LAYER_SIZE
    }

    if (nextHeight < MIN_LAYER_SIZE) {
      if (interaction.handle === 'nw' || interaction.handle === 'ne') {
        nextY -= MIN_LAYER_SIZE - nextHeight
      }
      nextHeight = MIN_LAYER_SIZE
    }

    setCanvasCursor(interaction.handle ? resizeHandleToCursor(interaction.handle) : 'default')
    updateLayer(interaction.layerId, {
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: Math.round(nextWidth),
      height: Math.round(nextHeight),
    })
  }

  const handleEditorPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = editorCanvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    const point = toCanvasPoint(event)
    if (point) {
      setCanvasCursor(getCursorAtPoint(point.x, point.y))
    } else {
      setCanvasCursor('default')
    }
    interactionRef.current = null
  }

  const handleLayerDrop = (targetLayerId: string) => {
    if (!draggingLayerId || draggingLayerId === targetLayerId) return
    const reordered = reorderByIds(layers, draggingLayerId, targetLayerId)
    setDraggingLayerId('')
    persistLayers(reordered)
  }

  const inputHandles = [
    { id: 'background', label: 'Background', color: 'text-zinc-200', handleClass: '!bg-zinc-200 !border-zinc-100' },
    ...Array.from({ length: layerCount }).map((_, index) => ({
      id: `image_${index}`,
      label: `Layer ${index + 1}`,
      color: 'text-emerald-300',
      handleClass: '!bg-emerald-400 !border-emerald-200',
    })),
  ]

  const getHandleTop = (index: number, total: number) => {
    if (total <= 1) return '50%'
    const start = 18
    const end = 74
    const step = (end - start) / (total - 1)
    return `${start + index * step}%`
  }

  return (
    <NodeContextMenu nodeId={id} type="context">
      <Card
        className={`relative w-[420px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
          }`}
        onPointerDownCapture={(event) => {
          if (isEditorOpen) {
            event.stopPropagation()
          }
        }}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <SquareDashedMousePointer className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-sm">Image Compositor</h3>
            </div>
            <NodeContextMenu nodeId={id} type="dropdown" asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Layers className="h-3.5 w-3.5" />
              </Button>
            </NodeContextMenu>
          </div>

          <div className="relative aspect-square w-full rounded-md border border-border overflow-hidden bg-muted/20">
            {output ? (
              <img src={output} alt="Image editor output" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                Connect image layers and click Edit
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs gap-1.5"
              onClick={() => updateNodeData(id, { layerCount: layerCount + 1 })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add another layer
            </Button>
            <Button type="button" size="sm" className="h-8 px-3 gap-1.5 text-xs" onClick={() => setIsEditorOpen(true)}>
              <PencilLine className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>

        {inputHandles.map((handle, index) => (
          <div
            key={`${handle.id}-label`}
            className={`absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase ${handle.color}`}
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
            className={`!w-3 !h-3 !border-2 ${handle.handleClass}`}
            style={{ top: getHandleTop(index, inputHandles.length) }}
          />
        ))}

        <div
          className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-emerald-300"
          style={{ top: '50%' }}
        >
          Output
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={OUTPUT_HANDLE_IDS.image}
          className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
          style={{ top: '50%' }}
        />

        <canvas ref={compositionCanvasRef} className="hidden" />
      </Card>

      {isEditorOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] bg-background">
          <div className="h-full w-full grid grid-rows-[56px_minmax(0,1fr)]">
            <div className="px-4 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-base font-semibold">Image Compositor</h2>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditorOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="h-full min-h-0 grid grid-cols-[300px_minmax(0,1fr)_340px]">
              <div className="border-r border-border/50 p-4 space-y-4 overflow-y-auto">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Canvas</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={String(canvasWidth)}
                      onChange={(event) =>
                        updateNodeData(id, { canvasWidth: clamp(Number(event.target.value) || canvasWidth, 128, 4096) })
                      }
                    />
                    <Input
                      value={String(canvasHeight)}
                      onChange={(event) =>
                        updateNodeData(id, { canvasHeight: clamp(Number(event.target.value) || canvasHeight, 128, 4096) })
                      }
                    />
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label className="text-[11px] text-muted-foreground">Background</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={backgroundColorPickerValue}
                        className="h-9 w-14 p-1"
                        onChange={(event) => updateNodeData(id, { backgroundColor: event.target.value })}
                      />
                      <Button
                        type="button"
                        variant={isBackgroundTransparent ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-9 px-3 text-xs"
                        onClick={() => updateNodeData(id, { backgroundColor: DEFAULT_BACKGROUND_COLOR })}
                      >
                        Transparent
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Layers</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5"
                      onClick={() => updateNodeData(id, { layerCount: layerCount + 1 })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {layers.map((layer) => (
                      <div
                        key={layer.id}
                        draggable
                        onDragStart={() => setDraggingLayerId(layer.id)}
                        onDragEnd={() => setDraggingLayerId('')}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleLayerDrop(layer.id)}
                        className={`rounded-md border ${draggingLayerId === layer.id ? 'opacity-70 border-primary/40' : 'border-transparent'}`}
                      >
                        <Button
                          type="button"
                          variant={effectiveSelectedLayerId === layer.id ? 'default' : 'ghost'}
                          className="w-full justify-start text-xs"
                          onClick={() => setSelectedLayerId(layer.id)}
                        >
                          <GripVertical className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                          {layer.name}
                          {!layer.source && <span className="ml-auto text-[10px] opacity-70">No input</span>}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-black/30 flex items-center justify-center">
                <div className="w-full h-full overflow-auto flex items-center justify-center">
                  <canvas
                    ref={editorCanvasRef}
                    className="max-w-full max-h-full border border-border/60 rounded-md touch-none bg-[#2d2f38]"
                    style={{ cursor: canvasCursor }}
                    onPointerDown={handleEditorPointerDown}
                    onPointerMove={handleEditorPointerMove}
                    onPointerUp={handleEditorPointerUp}
                    onPointerCancel={handleEditorPointerUp}
                    onPointerLeave={() => setCanvasCursor('default')}
                  />
                </div>
              </div>

              <div className="border-l border-border/50 p-4 overflow-y-auto">
                {selectedLayer ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">{selectedLayer.name}</Label>
                      <p className="text-[11px] text-muted-foreground">{selectedLayer.source ? 'Connected image layer' : 'No image connected'}</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Position</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={String(Math.round(selectedLayer.x))}
                          onChange={(event) => updateLayer(selectedLayer.id, { x: Number(event.target.value) || 0 })}
                        />
                        <Input
                          value={String(Math.round(selectedLayer.y))}
                          onChange={(event) => updateLayer(selectedLayer.id, { y: Number(event.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Dimensions</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={String(Math.round(selectedLayer.width))}
                          onChange={(event) => updateLayer(selectedLayer.id, { width: Number(event.target.value) || selectedLayer.width })}
                        />
                        <Input
                          value={String(Math.round(selectedLayer.height))}
                          onChange={(event) => updateLayer(selectedLayer.id, { height: Number(event.target.value) || selectedLayer.height })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Rotation</Label>
                      <Input
                        value={String(Math.round(selectedLayer.rotation))}
                        onChange={(event) => updateLayer(selectedLayer.id, { rotation: Number(event.target.value) || 0 })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Opacity</Label>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[Math.round(selectedLayer.opacity * 100)]}
                        onValueChange={(values) => {
                          const [value] = values
                          if (typeof value === 'number') {
                            updateLayer(selectedLayer.id, { opacity: value / 100 })
                          }
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Blend Mode</Label>
                      <Select
                        value={selectedLayer.blendMode}
                        onValueChange={(value) => {
                          if (isBlendMode(value)) {
                            updateLayer(selectedLayer.id, { blendMode: value })
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[130]">
                          {BLEND_MODE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => updateLayer(selectedLayer.id, { flipX: !selectedLayer.flipX })}>
                        <FlipHorizontal2 className="h-3.5 w-3.5 mr-1.5" />
                        Flip X
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => updateLayer(selectedLayer.id, { flipY: !selectedLayer.flipY })}>
                        <FlipVertical2 className="h-3.5 w-3.5 mr-1.5" />
                        Flip Y
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => updateLayer(selectedLayer.id, { x: Math.round(canvasWidth * 0.5 - selectedLayer.width * 0.5), y: selectedLayer.y })}>
                        <Move className="h-3.5 w-3.5 mr-1.5" />
                        Center X
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => updateLayer(selectedLayer.id, { x: selectedLayer.x, y: Math.round(canvasHeight * 0.5 - selectedLayer.height * 0.5) })}>
                        <Move className="h-3.5 w-3.5 mr-1.5" />
                        Center Y
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No layer selected.</p>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </NodeContextMenu>
  )
})

ImageCompositorNode.displayName = 'ImageCompositorNode'
