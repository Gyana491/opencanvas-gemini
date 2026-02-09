"use client"

import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type OnConnectStart,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type IsValidConnection,
  MarkerType,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, Download, Hand, Loader2, MousePointer2, Redo2, Share2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { toPng } from 'html-to-image'

import { ExportDialog } from './export-dialog'
import { ImportDialog } from './import-dialog'
import { ShareDialog } from './share-dialog'

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EditorSidebar } from './editor-sidebar'
import { NodeLibrary } from './node-library'
import { NodeProperties } from './node-properties'
import { workflowNodeTypes } from './node-types'
import { useWorkflow } from './hooks/use-workflow'
import { useUndoRedo } from './hooks/use-undo-redo'
import { MODELS, OUTPUT_HANDLE_IDS, TOOL_OUTPUT_HANDLE_IDS } from '@/data/models'
import { TOOLS } from '@/data/tools'
import { PaneContextMenu } from './pane-context-menu'
import { uploadToR2 } from '@/lib/utils/upload'
import { useIsMobile } from '@/hooks/use-mobile'
import { DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION } from './nodes/tools/image-describer-node'
import { DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION } from './nodes/tools/video-describer-node'
import { DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION } from './nodes/tools/prompt-enhancer-node'
import { usePreventNavigationScroll } from '@/hooks/use-prevent-navigation-scroll'

const NODES_WITH_PROPERTIES = [
  'imagen-4.0-generate-001',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'veo-3.1-generate-preview',
  'imageDescriber',
  'videoDescriber',
  'promptEnhancer',
]

type WorkflowNodeData = {
  label: string
} & NodeHandleMeta & Record<string, unknown>

const initialNodes: Node<WorkflowNodeData>[] = []
const initialEdges: Edge[] = []

type HandleKind = 'text' | 'image' | 'video'

type HandleMeta = {
  id: string
  label: string
  type: HandleKind
  required?: boolean
  allowedSourceIds?: string[]
}

type NodeHandleMeta = {
  inputs?: HandleMeta[]
  outputs?: HandleMeta[]
}

// OUTPUT_HANDLE_IDS is now imported from @/data/models

type LegacyHandleMeta = Partial<HandleMeta> & {
  level?: string
}

const EDGE_COLORS = {
  text: '#38bdf8', // sky-400
  image: '#34d399', // emerald-400
  video: '#a78bfa', // violet-400
  default: '#94a3b8', // slate-400
} as const
const EDGE_STROKE_WIDTH = 2.5
const EDGE_MARKER_SIZE = 16
const EDGE_INTERACTION_WIDTH = 28
const MAX_VIDEO_FILE_SIZE_BYTES = 200 * 1024 * 1024
const GROUP_NODE_TYPE = 'workflowGroup'
const GROUP_PADDING_X = 48
const GROUP_PADDING_Y = 48
const MIN_GROUP_WIDTH = 380
const MIN_GROUP_HEIGHT = 260

function canonicalizeNodeType(nodeType: string | undefined): string | undefined {
  if (nodeType === 'imageEditor') {
    return 'imageCompositor'
  }
  return nodeType
}

function getKindFromSourceHandle(sourceHandle?: string | null): HandleKind | null {
  if (!sourceHandle) {
    return null
  }
  if (sourceHandle === OUTPUT_HANDLE_IDS.text) {
    return 'text'
  }
  if (sourceHandle === OUTPUT_HANDLE_IDS.image) {
    return 'image'
  }
  if (
    sourceHandle === TOOL_OUTPUT_HANDLE_IDS.painterResult ||
    sourceHandle === TOOL_OUTPUT_HANDLE_IDS.painterMask
  ) {
    return 'image'
  }
  if (sourceHandle === OUTPUT_HANDLE_IDS.video) {
    return 'video'
  }
  return null
}

function getEdgeColorFromSourceHandle(sourceHandle?: string | null): string {
  const kind = getKindFromSourceHandle(sourceHandle)
  return kind ? EDGE_COLORS[kind] : EDGE_COLORS.default
}

function getEdgeVisualProps(sourceHandle: string | null | undefined, animated: boolean) {
  const stroke = getEdgeColorFromSourceHandle(sourceHandle)

  return {
    animated,
    interactionWidth: EDGE_INTERACTION_WIDTH,
    style: { stroke, strokeWidth: EDGE_STROKE_WIDTH },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: stroke,
      width: EDGE_MARKER_SIZE,
      height: EDGE_MARKER_SIZE,
    },
  }
}

function normalizeHandleType(value: unknown, id: string): HandleKind {
  if (value === 'text' || value === 'image' || value === 'video') {
    return value
  }

  if (id === OUTPUT_HANDLE_IDS.text || id === 'prompt' || id.includes('text')) {
    return 'text'
  }
  if (id === OUTPUT_HANDLE_IDS.video || id.includes('video')) {
    return 'video'
  }
  return 'image'
}

function getDefaultHandleLabel(id: string, type: HandleKind): string {
  if (id === 'prompt') return 'Prompt'
  const promptMatch = id.match(/^prompt_(\d+)$/)
  if (promptMatch) return `Prompt ${Number(promptMatch[1]) + 1}`
  if (id === OUTPUT_HANDLE_IDS.text || id === 'text' || (id === 'output' && type === 'text')) return 'Text'
  if (id === OUTPUT_HANDLE_IDS.image || id === 'image' || (id === 'output' && type === 'image')) return 'Image'
  if (id === TOOL_OUTPUT_HANDLE_IDS.painterResult) return 'Result'
  if (id === TOOL_OUTPUT_HANDLE_IDS.painterMask) return 'Mask'
  if (id === OUTPUT_HANDLE_IDS.video || id === 'video' || (id === 'output' && type === 'video')) return 'Video'

  const imageMatch = id.match(/^image_(\d+)$/)
  if (imageMatch) {
    return `Ref Image ${Number(imageMatch[1]) + 1}`
  }

  const refImageMatch = id.match(/^ref_image_(\d+)$/)
  if (refImageMatch) {
    return `Ref ${Number(refImageMatch[1]) + 1}`
  }

  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeHandleList(rawHandles: unknown, direction: 'input' | 'output'): HandleMeta[] {
  if (!Array.isArray(rawHandles)) {
    return []
  }

  return rawHandles.map((rawHandle, index) => {
    const candidate = (rawHandle && typeof rawHandle === 'object' ? rawHandle : {}) as LegacyHandleMeta
    const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0
      ? candidate.id
      : `${direction}_${index}`
    const type = normalizeHandleType(candidate.type, id)
    const rawLabel = typeof candidate.label === 'string' && candidate.label.trim().length > 0
      ? candidate.label
      : typeof candidate.level === 'string' && candidate.level.trim().length > 0
        ? candidate.level
        : undefined
    const label = rawLabel || getDefaultHandleLabel(id, type)

    return {
      id,
      label,
      type,
      required: Boolean(candidate.required),
      allowedSourceIds: Array.isArray(candidate.allowedSourceIds)
        ? candidate.allowedSourceIds.filter((sourceId): sourceId is string => typeof sourceId === 'string')
        : undefined,
    }
  })
}

const RUNTIME_ONLY_TOOL_NODE_TYPES = new Set(['blur', 'colorGrading', 'crop', 'painter', 'extractVideoFrame', 'imageCompositor'])

function stripRuntimeDataFromNodeData<T extends Record<string, unknown>>(nodeType: string | undefined, data: T): T {
  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'function') {
      continue
    }

    // Connection payloads are derived from edges and rebuilt at runtime.
    // Never persist any `connected*` field (e.g. connectedFirstFrame/connectedLastFrame).
    if (key.startsWith('connected')) {
      continue
    }

    // Blob URLs are runtime-only and invalid after reload.
    if (typeof value === 'string' && value.startsWith('blob:')) {
      continue
    }

    if (
      RUNTIME_ONLY_TOOL_NODE_TYPES.has(nodeType || '') &&
      (
        key === 'output' ||
        key === 'imageOutput' ||
        key === 'videoOutput' ||
        key === 'maskOutput' ||
        key === 'getOutput' ||
        key === 'getMaskOutput'
      )
    ) {
      continue
    }

    if (key === 'isUploading' || key === 'uploadError' || key === 'localPreviewUrl') {
      continue
    }

    cleaned[key] = value
  }

  return cleaned as T
}

function getNodeHandles(nodeType: string | undefined, data?: any): NodeHandleMeta {
  const normalizedNodeType = canonicalizeNodeType(nodeType)
  nodeType = normalizedNodeType
  if (!nodeType) return { inputs: [], outputs: [] }

  const model = MODELS.find(m => m.id === nodeType) || TOOLS.find(t => t.id === nodeType);
  if (!model) return { inputs: [], outputs: [] };

  const inputs = normalizeHandleList(model.inputs || [], 'input');
  const outputs = normalizeHandleList(model.outputs || [], 'output');

  // Handle dynamic image inputs for specific models
  if (nodeType === 'gemini-2.5-flash-image' || nodeType === 'gemini-3-pro-image-preview') {
    const imageCount = (data?.imageInputCount as number) || 1;
    for (let i = 0; i < imageCount; i++) {
      inputs.push({
        id: `image_${i}`,
        label: `Ref Image ${i + 1}`,
        type: 'image',
        allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
      });
    }
  } else if (nodeType === 'veo-3.1-generate-preview') {
    const refImageCount = (data?.imageInputCount as number) || 0;
    for (let i = 0; i < refImageCount; i++) {
      inputs.push({
        id: `ref_image_${i}`,
        label: `Ref ${i + 1}`,
        type: 'image',
        allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
      });
    }
  } else if (nodeType === 'imageDescriber') {
    const imageCount = Math.max(1, Number(data?.imageInputCount || 1));
    for (let i = 0; i < imageCount; i++) {
      inputs.push({
        id: `image_${i}`,
        label: imageCount === 1 ? 'Image' : `Image ${i + 1}`,
        type: 'image',
        allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
      });
    }
  } else if (nodeType === 'promptEnhancer') {
    const imageCount = Math.max(1, Number(data?.imageInputCount || 1));
    for (let i = 0; i < imageCount; i++) {
      inputs.push({
        id: `image_${i}`,
        label: `Image ${i + 1}`,
        type: 'image',
        allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
      });
    }
  } else if (nodeType === 'promptConcatenator') {
    const promptCount = Math.max(1, Number(data?.inputCount || 2));
    for (let i = 0; i < promptCount; i++) {
      inputs.push({
        id: `prompt_${i}`,
        label: `Prompt ${i + 1}`,
        type: 'text',
        allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
      });
    }
  } else if (nodeType === 'imageCompositor') {
    const layerCount = Math.max(1, Number(data?.layerCount || 2))
    inputs.push({
      id: 'background',
      label: 'Background',
      type: 'image',
      allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
    })
    for (let i = 0; i < layerCount; i++) {
      inputs.push({
        id: `image_${i}`,
        label: `Layer ${i + 1}`,
        type: 'image',
        allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
      })
    }
  }

  return {
    inputs: normalizeHandleList(inputs, 'input'),
    outputs: normalizeHandleList(outputs, 'output'),
  }
}

function normalizeNodeHandleData(nodeType: string | undefined, data: unknown): WorkflowNodeData {
  const normalizedNodeType = canonicalizeNodeType(nodeType)
  const safeData = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const defaults = getNodeHandles(normalizedNodeType, safeData)
  const inputs = normalizeHandleList(safeData.inputs ?? defaults.inputs ?? [], 'input')
  const outputs = normalizeHandleList(safeData.outputs ?? defaults.outputs ?? [], 'output')
  const model = MODELS.find((m) => m.id === normalizedNodeType) || TOOLS.find((t) => t.id === normalizedNodeType)
  const label = typeof safeData.label === 'string' && safeData.label.trim().length > 0
    ? safeData.label
    : model?.title || normalizedNodeType || 'Node'

  return {
    ...(safeData as WorkflowNodeData),
    label,
    inputs,
    outputs,
  }
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }
  if (error && typeof error === 'object') {
    const entries = Object.entries(error as Record<string, unknown>)
    if (entries.length > 0) {
      return entries.map(([key, value]) => `${key}=${String(value)}`).join(', ')
    }
  }
  return ''
}

function getNodeDimension(node: Node<WorkflowNodeData>, axis: 'width' | 'height'): number {
  const measured = (node as Node<WorkflowNodeData> & { measured?: { width?: number; height?: number } }).measured
  if (axis === 'width') {
    return Math.max(
      1,
      Math.round(
        (typeof node.width === 'number' ? node.width : undefined) ??
        (typeof measured?.width === 'number' ? measured.width : undefined) ??
        320
      )
    )
  }

  return Math.max(
    1,
    Math.round(
      (typeof node.height === 'number' ? node.height : undefined) ??
      (typeof measured?.height === 'number' ? measured.height : undefined) ??
      180
    )
  )
}

function getAbsoluteNodePosition(
  node: Node<WorkflowNodeData>,
  nodeMap: Map<string, Node<WorkflowNodeData>>
): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId

  while (parentId) {
    const parent = nodeMap.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }

  return { x, y }
}

function getNodeDimensionWithStyle(node: Node<WorkflowNodeData>, axis: 'width' | 'height'): number {
  const styleValue = node.style && typeof node.style === 'object'
    ? (node.style as Record<string, unknown>)[axis]
    : undefined
  if (typeof styleValue === 'number' && Number.isFinite(styleValue)) {
    return Math.max(1, Math.round(styleValue))
  }

  return getNodeDimension(node, axis)
}

function getNodeDepth(node: Node<WorkflowNodeData>, nodeMap: Map<string, Node<WorkflowNodeData>>): number {
  let depth = 0
  let parentId = node.parentId
  while (parentId) {
    const parent = nodeMap.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentId
  }
  return depth
}

function findContainingGroup(
  position: { x: number; y: number },
  nodes: Node<WorkflowNodeData>[]
): Node<WorkflowNodeData> | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const groupCandidates = nodes
    .filter((node) => node.type === GROUP_NODE_TYPE)
    .map((group) => {
      const absolute = getAbsoluteNodePosition(group, nodeMap)
      const width = getNodeDimensionWithStyle(group, 'width')
      const height = getNodeDimensionWithStyle(group, 'height')
      const contains =
        position.x >= absolute.x &&
        position.x <= absolute.x + width &&
        position.y >= absolute.y &&
        position.y <= absolute.y + height
      if (!contains) {
        return null
      }
      const depth = getNodeDepth(group, nodeMap)
      const area = width * height
      return { group, depth, area }
    })
    .filter((entry): entry is { group: Node<WorkflowNodeData>; depth: number; area: number } => Boolean(entry))

  if (groupCandidates.length === 0) {
    return null
  }

  groupCandidates.sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth
    return a.area - b.area
  })

  return groupCandidates[0].group
}

function isDescendantOf(
  candidate: Node<WorkflowNodeData>,
  ancestorId: string,
  nodeMap: Map<string, Node<WorkflowNodeData>>
): boolean {
  let parentId = candidate.parentId
  while (parentId) {
    if (parentId === ancestorId) return true
    const parent = nodeMap.get(parentId)
    if (!parent) break
    parentId = parent.parentId
  }
  return false
}

function WorkflowEditorInner() {
  const params = useParams()
  const router = useRouter()
  const workflowId = params.id as string

  usePreventNavigationScroll()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [isLibraryOpen, setIsLibraryOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [connectingSourceHandle, setConnectingSourceHandle] = useState<string | null>(null)
  const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null)
  const [isAnimated, setIsAnimated] = useState(true)
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select')
  const { screenToFlowPosition, setViewport, getViewport, getNodes, getEdges } = useReactFlow()
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [newName, setNewName] = useState("")
  const [workflowName, setWorkflowName] = useState("")
  const [isInitialGraphLoading, setIsInitialGraphLoading] = useState(true)
  const isMobile = useIsMobile()

  const { createWorkflow, loadWorkflow, saveWorkflow, renameWorkflow, deleteWorkflow, duplicateWorkflow, isLoading } = useWorkflow()

  // Undo/Redo functionality (client-side only)
  const { takeSnapshot, undo, redo, clearHistory, canUndo, canRedo } = useUndoRedo()

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const AUTO_SAVE_DELAY = 2000 // 2 seconds

  // Track if workflow creation is in progress to prevent duplicates
  const creationInProgressRef = useRef(false)

  // Load workflow on mount
  useEffect(() => {
    async function loadWorkflowData() {
      if (!workflowId) {
        setIsInitialGraphLoading(false)
        return
      }

      setIsInitialGraphLoading(true)

      try {
        if (workflowId === 'new') {
          // Prevent duplicate creation (React.StrictMode causes double effect)
          if (creationInProgressRef.current) {
            console.log('[Workflow Editor] Creation already in progress, skipping...')
            return
          }

          creationInProgressRef.current = true

          // Create new workflow
          const response = await createWorkflow()
          if (response.success && response.data) {
            console.log('[Workflow Editor] Created new workflow:', response.data.id)
            router.push(`/editor/${response.data.id}`)
            toast.success('New file created successfully')
          } else {
            console.error('[Workflow Editor] Failed to create workflow:', response.error)
          }
        } else {
          // Load existing workflow
          const response = await loadWorkflow(workflowId)
          if (response.success && response.data) {
            // Check if data field is string or object (Postgres JSON type comes as object usually, but check)
            // The API response.data is the workflow object.
            // workflow.data contains { nodes, edges, viewport }
            const workflow = response.data
            const { nodes: loadedNodes, edges: loadedEdges, viewport } = workflow.data as any

            console.log('[Workflow Editor] Loaded workflow:', workflowId, {
              nodes: loadedNodes?.length,
              edges: loadedEdges?.length,
            })

            setWorkflowName(workflow.name)
            const sanitizedLoadedNodes = ((loadedNodes || []) as Node<WorkflowNodeData>[]).map((node) => {
              const normalizedType = canonicalizeNodeType(node.type)
              const rawData = (node.data || {}) as Record<string, unknown>
              const normalizedData = normalizeNodeHandleData(normalizedType, rawData)
              return {
                ...node,
                type: normalizedType,
                data: stripRuntimeDataFromNodeData(normalizedType, normalizedData),
              }
            })

            setNodes(sanitizedLoadedNodes)
            setEdges(
              (loadedEdges || []).map((edge: Edge) => ({
                ...edge,
                ...getEdgeVisualProps(edge.sourceHandle, edge.animated ?? true),
              }))
            )
            if (viewport) {
              setViewport(viewport, { duration: 0 })
            }
          } else {
            console.error('[Workflow Editor] Failed to load workflow:', response.error)
            // If workflow doesn't exist, redirect to home
            if (response.error === 'Workflow not found') {
              router.push('/')
            }
          }
        }
      } catch (error) {
        console.error('[Workflow Editor] Error loading workflow:', error)
      } finally {
        creationInProgressRef.current = false
        setIsInitialGraphLoading(false)
      }
    }

    loadWorkflowData()
  }, [workflowId, router, createWorkflow, loadWorkflow, setEdges, setNodes, setViewport])


  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const lastThumbnailTimeRef = useRef<number>(0)
  const isGeneratingThumbnailRef = useRef(false)
  const pendingThumbnailGenerationRef = useRef(false)
  const thumbnailRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helper to sanitize nodes for saving (remove functions)
  const getSerializableGraph = useCallback((nodes: Node[], edges: Edge[]) => {
    const serializableNodes = nodes.map(node => {
      const { data, ...rest } = node
      const cleanData = stripRuntimeDataFromNodeData(node.type, (data || {}) as Record<string, unknown>)

      return {
        ...rest,
        data: cleanData
      }
    })

    return { nodes: serializableNodes, edges }
  }, [])

  const generateThumbnail = useCallback(async () => {
    if (!reactFlowWrapper.current || !workflowId || workflowId === 'new') return

    // console.log('[Workflow Editor] Thumbnail generation requested', {
    //   workflowId,
    //   isGenerating: isGeneratingThumbnailRef.current,
    //   hasPendingGeneration: pendingThumbnailGenerationRef.current,
    // })

    if (isGeneratingThumbnailRef.current) {
      pendingThumbnailGenerationRef.current = true
      // console.log('[Workflow Editor] Thumbnail generation already in progress, queued follow-up run')
      return
    }
    isGeneratingThumbnailRef.current = true

    try {
      const hasUploadingNodes = nodes.some((node) => {
        const data = node.data as Record<string, unknown>
        return Boolean(data?.isUploading)
      })

      if (hasUploadingNodes) {
        // console.log('[Workflow Editor] Thumbnail skipped due to active uploads; scheduling retry', { workflowId })
        if (!thumbnailRetryTimerRef.current) {
          thumbnailRetryTimerRef.current = setTimeout(() => {
            thumbnailRetryTimerRef.current = null
            // console.log('[Workflow Editor] Retrying thumbnail generation after upload wait', { workflowId })
            void generateThumbnail()
          }, 3000)
        }
        return
      }

      if (thumbnailRetryTimerRef.current) {
        clearTimeout(thumbnailRetryTimerRef.current)
        thumbnailRetryTimerRef.current = null
      }

      // Extended delay to ensure all images are loaded
      // console.log('[Workflow Editor] Capturing thumbnail image', { workflowId, nodes: nodes.length })
      await new Promise(resolve => setTimeout(resolve, 500))

      const captureTarget = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement | null
      const target = captureTarget || reactFlowWrapper.current
      const excludeClasses = [
        'react-flow__controls',
        'react-flow__minimap',
        'react-flow__panel',
        'react-flow__attribution'
      ]
      const filterNode = (node: HTMLElement) => {
        // html-to-image may invoke filter on non-Element nodes; skip those.
        if (!(node instanceof Element)) {
          return false
        }
        return !excludeClasses.some(cls => node.classList.contains(cls))
      }

      let dataUrl: string
      try {
        dataUrl = await toPng(target, {
          backgroundColor: '#fff',
          width: 1280,
          height: 720,
          cacheBust: true,
          pixelRatio: 1,
          skipAutoScale: true,
          includeQueryParams: true,
          filter: filterNode,
        })
      } catch {
        dataUrl = await toPng(target, {
          backgroundColor: '#fff',
          cacheBust: true,
          pixelRatio: 1,
          filter: filterNode,
        })
      }

      // Convert dataUrl to blob
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], "thumbnail.png", { type: "image/png" })
      // console.log('[Workflow Editor] Thumbnail capture complete', {
      //   workflowId,
      //   bytes: blob.size,
      //   type: blob.type,
      // })

      if (!workflowId || workflowId === 'new') {
        // console.log('[Workflow Editor] persistent ID required for thumbnail generation')
        return
      }

      const formData = new FormData()
      formData.append('file', file)

      // console.log('[Workflow Editor] Uploading thumbnail', { workflowId })
      const uploadRes = await fetch(`/api/workflows/${workflowId}/thumbnail`, {
        method: 'POST',
        body: formData,
      })

      if (uploadRes.ok) {
        // console.log('[Workflow Editor] Thumbnail updated', { workflowId })
        lastThumbnailTimeRef.current = Date.now()
      } else {
        const errorText = await uploadRes.text()
        // console.error('[Workflow Editor] Failed to update thumbnail:', {
        //   workflowId,
        //   status: uploadRes.status,
        //   statusText: uploadRes.statusText,
        //   errorText,
        // })
      }
    } catch {
      // Don't throw - allow the app to continue if thumbnail fails
    } finally {
      isGeneratingThumbnailRef.current = false
      if (pendingThumbnailGenerationRef.current) {
        // console.log('[Workflow Editor] Running queued thumbnail generation')
        pendingThumbnailGenerationRef.current = false
        void generateThumbnail()
      }
    }
  }, [workflowId, nodes])

  useEffect(() => {
    return () => {
      if (thumbnailRetryTimerRef.current) {
        clearTimeout(thumbnailRetryTimerRef.current)
        thumbnailRetryTimerRef.current = null
      }
    }
  }, [])

  // Auto-save workflow when nodes, edges, or viewport changes
  useEffect(() => {
    if (isLoading || !workflowId || workflowId === 'new') {
      return
    }

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // Set new auto-save timer
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const viewport = getViewport()
        const { nodes: safeNodes, edges: safeEdges } = getSerializableGraph(nodes, edges)

        // console.log('[Workflow Editor] Auto-saving workflow:', workflowId)

        const response = await saveWorkflow(workflowId, safeNodes, safeEdges, viewport)
        if (response.success) {
          // console.log('[Workflow Editor] Auto-saved workflow:', workflowId)

          // Check if we should update thumbnail (every 60 seconds)
          if (Date.now() - lastThumbnailTimeRef.current > 60000) {
            // console.log('[Workflow Editor] Auto-save triggering thumbnail generation', {
            //   workflowId,
            //   lastGeneratedAt: lastThumbnailTimeRef.current,
            // })
            generateThumbnail()
          } // else {
          //   console.log('[Workflow Editor] Thumbnail generation not needed yet', {
          //     workflowId,
          //     msSinceLastThumbnail: Date.now() - lastThumbnailTimeRef.current,
          //   })
          // }

        } else {
          // console.error('[Workflow Editor] Auto-save failed:', response.error)
        }
      } catch {
        // console.error('[Workflow Editor] Auto-save error:', error)
      }
    }, AUTO_SAVE_DELAY)

    // Cleanup on unmount
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [nodes, edges, workflowId, isLoading, getViewport, getSerializableGraph, saveWorkflow, generateThumbnail])


  const toggleAnimation = useCallback(() => {
    setIsAnimated((prev) => !prev)
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        animated: !isAnimated,
      }))
    )
  }, [isAnimated, setEdges])

  // Keyboard shortcuts for Undo/Redo
  const handleUndo = useCallback(() => {
    if (canUndo) {
      undo(setNodes as any, setEdges as any, nodes, edges)
    }
  }, [canUndo, undo, setNodes, setEdges, nodes, edges])

  const handleRedo = useCallback(() => {
    if (canRedo) {
      redo(setNodes as any, setEdges as any, nodes, edges)
    }
  }, [canRedo, redo, setNodes, setEdges, nodes, edges])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focused on an input or textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  // Track node position changes to take snapshots after drag ends
  const isDraggingRef = useRef(false)
  const dragSnapshotTakenRef = useRef(false)

  // Wrapped onNodesChange to take snapshots before significant changes
  const onNodesChangeWithSnapshot = useCallback(
    (changes: any[]) => {
      // Check if there are any position changes starting (drag start)
      const positionChanges = changes.filter((c: any) => c.type === 'position')
      const isStartingDrag = positionChanges.some((c: any) => c.dragging === true)
      const isEndingDrag = positionChanges.some((c: any) => c.dragging === false)

      // Take snapshot at drag start
      if (isStartingDrag && !isDraggingRef.current) {
        isDraggingRef.current = true
        dragSnapshotTakenRef.current = false
        // Take snapshot before the drag
        takeSnapshot(nodes, edges)
        dragSnapshotTakenRef.current = true
      }

      // Reset drag state when drag ends
      if (isEndingDrag) {
        isDraggingRef.current = false
      }

      // Take snapshot before node removal
      const removeChanges = changes.filter((c: any) => c.type === 'remove')
      if (removeChanges.length > 0) {
        takeSnapshot(nodes, edges)
      }

      // Apply the changes
      onNodesChange(changes)
    },
    [onNodesChange, takeSnapshot, nodes, edges]
  )

  // Wrapped onEdgesChange to take snapshots before edge removal
  const onEdgesChangeWithSnapshot = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      // Take snapshot before edge removal
      const removeChanges = changes.filter((c) => c.type === 'remove')
      if (removeChanges.length > 0) {
        takeSnapshot(nodes, edges)
      }

      onEdgesChange(changes)
    },
    [onEdgesChange, takeSnapshot, nodes, edges]
  )

  const updateNodeData = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...data } }
        }
        return node
      })
    )
    // Update selected node state to reflect changes
    setSelectedNode((current: any) =>
      current?.id === nodeId
        ? { ...current, data: { ...current.data, ...data } }
        : current
    )
  }, [setNodes, setSelectedNode])

  // Propagate connected node data through edges
  // Track both edge wiring and relevant node outputs to avoid missing fresh connections.
  const graphSignatureRef = React.useRef<string>('')
  const edgeSignature = React.useMemo(() => {
    return JSON.stringify(
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }))
    )
  }, [edges])
  const nodeOutputs = React.useMemo(() => {
    return JSON.stringify(nodes.map(n => ({
      id: n.id,
      output: n.data.output,
      imageOutput: n.data.imageOutput,
      videoUrl: n.data.videoUrl,
      videoBlobUrl: n.data.videoBlobUrl,
      maskOutput: n.data.maskOutput,
      imageUrl: n.data.imageUrl,
      playheadTime: n.data.playheadTime,
      videoDurationSeconds: n.data.videoDurationSeconds,
      videoFps: n.data.videoFps,
      videoFrameIndex: n.data.videoFrameIndex,
      text: n.data.text,
      blurType: n.data.blurType,
      blurSize: n.data.blurSize
    })))
  }, [nodes])
  const graphSignature = React.useMemo(() => `${edgeSignature}::${nodeOutputs}`, [edgeSignature, nodeOutputs])

  React.useEffect(() => {
    if (graphSignatureRef.current === graphSignature) {
      return
    }
    graphSignatureRef.current = graphSignature

    setNodes((currentNodes) => {
      const updatedNodes = currentNodes.map((node) => {
        const incomingEdges = edges.filter((edge) => edge.target === node.id)
        const isVeoNode = node.type === 'veo-3.1-generate-preview'
        const isExtractVideoFrameNode = node.type === 'extractVideoFrame'
        const isImageCompositorNode = node.type === 'imageCompositor'

        const connectedData: Record<string, any> = {}
        if (isVeoNode) {
          connectedData.connectedPrompt = ''
          connectedData.connectedFirstFrame = ''
          connectedData.connectedLastFrame = ''
          connectedData.connectedVideo = ''
          const refImageCount = Number(node.data.imageInputCount) || 0
          for (let i = 0; i < refImageCount; i++) {
            connectedData[`connectedRefImage_${i}`] = ''
          }
        }
        if (isExtractVideoFrameNode) {
          connectedData.connectedVideo = ''
          connectedData.connectedVideoBlob = ''
          connectedData.connectedVideoCurrentTime = 0
          connectedData.connectedVideoDuration = 0
          connectedData.connectedVideoFps = 24
          connectedData.connectedVideoFrameIndex = 0
        }
        if (isImageCompositorNode) {
          connectedData.connectedBackground = ''
          const layerCount = Math.max(1, Number(node.data.layerCount) || 2)
          for (let i = 0; i < layerCount; i++) {
            connectedData[`connectedImage_${i}`] = ''
          }
        }

        const resolveSourceImageValue = (sourceNode: Node<WorkflowNodeData>, sourceHandle?: string | null) => {
          if (sourceNode.type === 'imageUpload') {
            return sourceNode.data.imageUrl || sourceNode.data.assetPath || ''
          }
          if (sourceNode.type === 'gemini-2.5-flash-image' || sourceNode.type === 'gemini-3-pro-image-preview' || sourceNode.type === 'imagen-4.0-generate-001') {
            return sourceNode.data.output || ''
          }
          if (sourceNode.type === 'blur' || sourceNode.type === 'colorGrading') {
            return sourceNode.data.output || (typeof sourceNode.data.getOutput === 'function' ? sourceNode.data.getOutput() : '')
          }
          if (sourceNode.type === 'crop') {
            return sourceNode.data.imageOutput || (typeof sourceNode.data.getOutput === 'function' ? sourceNode.data.getOutput() : '')
          }
          if (sourceNode.type === 'painter') {
            if (sourceHandle === TOOL_OUTPUT_HANDLE_IDS.painterMask) {
              return sourceNode.data.maskOutput || (typeof sourceNode.data.getMaskOutput === 'function' ? sourceNode.data.getMaskOutput() : '')
            }
            return sourceNode.data.output || sourceNode.data.imageOutput || (typeof sourceNode.data.getOutput === 'function' ? sourceNode.data.getOutput() : '')
          }
          return sourceNode.data.imageOutput || sourceNode.data.output || sourceNode.data.imageUrl || sourceNode.data.assetPath || ''
        }

        incomingEdges.forEach((edge) => {
          const sourceNode = currentNodes.find((n) => n.id === edge.source)
          if (!sourceNode) return

          const targetHandle = edge.targetHandle
          const sourceHandle = edge.sourceHandle

          // Map source data to target connected fields
          if (targetHandle === 'prompt') {
            if (sourceNode.type === 'textInput') {
              connectedData.connectedPrompt = sourceNode.data.text || ''
            } else if (sourceNode.data.output) {
              connectedData.connectedPrompt = sourceNode.data.output
            }
          } else if (
            targetHandle === 'background' ||
            targetHandle === 'image' ||
            targetHandle === 'firstFrame' ||
            targetHandle === 'lastFrame' ||
            targetHandle === 'imageOutput' ||
            targetHandle?.startsWith('image_') ||
            targetHandle?.startsWith('ref_image_')
          ) {
            const sourceImageValue = resolveSourceImageValue(sourceNode, sourceHandle)
            let dataKey: string

            if ((targetHandle === 'image' || targetHandle === 'firstFrame') && isVeoNode) {
              dataKey = 'connectedFirstFrame'
            } else if (targetHandle === 'lastFrame' && isVeoNode) {
              dataKey = 'connectedLastFrame'
            } else if (targetHandle === 'background') {
              dataKey = 'connectedBackground'
            } else if (targetHandle === 'image' || targetHandle === 'imageOutput') {
              dataKey = 'connectedImage'
            } else if (targetHandle?.startsWith('ref_image_')) {
              dataKey = `connectedRefImage_${targetHandle.split('_')[2]}`
            } else {
              dataKey = `connectedImage_${targetHandle?.split('_')[1]}`
            }

            connectedData[dataKey] = sourceImageValue || ''
          } else if (targetHandle === 'video' || targetHandle === OUTPUT_HANDLE_IDS.video) {
            connectedData.connectedVideo =
              sourceNode.data.output ||
              sourceNode.data.videoUrl ||
              sourceNode.data.assetPath ||
              ''
            connectedData.connectedVideoBlob =
              (typeof sourceNode.data.videoBlobUrl === 'string' && sourceNode.data.videoBlobUrl.startsWith('blob:'))
                ? sourceNode.data.videoBlobUrl
                : (typeof sourceNode.data.output === 'string' && sourceNode.data.output.startsWith('blob:'))
                  ? sourceNode.data.output
                  : ''
            connectedData.connectedVideoCurrentTime =
              typeof sourceNode.data.playheadTime === 'number' && Number.isFinite(sourceNode.data.playheadTime)
                ? sourceNode.data.playheadTime
                : 0
            connectedData.connectedVideoDuration =
              typeof sourceNode.data.videoDurationSeconds === 'number' && Number.isFinite(sourceNode.data.videoDurationSeconds)
                ? sourceNode.data.videoDurationSeconds
                : 0
            connectedData.connectedVideoFps =
              typeof sourceNode.data.videoFps === 'number' && Number.isFinite(sourceNode.data.videoFps)
                ? sourceNode.data.videoFps
                : 24
            connectedData.connectedVideoFrameIndex =
              typeof sourceNode.data.videoFrameIndex === 'number' && Number.isFinite(sourceNode.data.videoFrameIndex)
                ? sourceNode.data.videoFrameIndex
                : 0
          }
        })

        // Check if node has connected data that should be cleared
        // (no incoming edges for an image target handle means we should clear connectedImage)
        const hasImageEdge = incomingEdges.some((edge) =>
          edge.targetHandle === 'image' || edge.targetHandle === 'imageOutput'
        )

        // If node type expects image input but has no image edge, clear it
        if ((node.type === 'blur' || node.type === 'colorGrading') && !hasImageEdge) {
          if (node.data.connectedImage) {
            return {
              ...node,
              data: {
                ...node.data,
                connectedImage: '',
                output: null,
                imageOutput: null,
                getOutput: null,
              },
            }
          }
        }

        if (node.type === 'crop' && !hasImageEdge) {
          if (node.data.connectedImage) {
            return {
              ...node,
              data: {
                ...node.data,
                connectedImage: '',
                output: null,
                imageOutput: null,
                getOutput: null,
                cropRect: null,
              },
            }
          }
        }

        if (node.type === 'painter' && !hasImageEdge) {
          if (node.data.connectedImage) {
            return {
              ...node,
              data: {
                ...node.data,
                connectedImage: '',
                output: null,
                imageOutput: null,
                maskOutput: null,
                getOutput: null,
                getMaskOutput: null,
              },
            }
          }
        }

        // Only update if there are connected data changes
        if (incomingEdges.length > 0 || isVeoNode || isExtractVideoFrameNode || isImageCompositorNode) {
          const hasChanges = Object.keys(connectedData).some(
            (key) => node.data[key] !== connectedData[key]
          )

          if (hasChanges) {
            if (isVeoNode) {
              console.log('[Workflow Editor][Veo Wiring Update]', {
                nodeId: node.id,
                incomingEdges: incomingEdges.map((edge) => ({
                  id: edge.id,
                  source: edge.source,
                  sourceHandle: edge.sourceHandle,
                  targetHandle: edge.targetHandle,
                })),
                connectedData,
              })
            }
            return {
              ...node,
              data: {
                ...node.data,
                ...connectedData,
              },
            }
          }
        }

        // Ensure onUpdateNodeData is available on all nodes
        if (!node.data.onUpdateNodeData) {
          return {
            ...node,
            data: {
              ...node.data,
              onUpdateNodeData: updateNodeData,
            },
          }
        }

        return node
      })

      return updatedNodes
    })
  }, [edges, graphSignature, updateNodeData, setNodes])

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (edgeOrConnection) => {
      const target = edgeOrConnection.target
      const targetHandle = edgeOrConnection.targetHandle
      const sourceHandle = edgeOrConnection.sourceHandle

      if (!target || !targetHandle || typeof sourceHandle !== 'string') {
        return false
      }

      // Prevent multiple connections to the same target handle
      const currentEdgeId = 'id' in edgeOrConnection ? edgeOrConnection.id : reconnectingEdgeId
      const existingConnection = edges.find(
        (edge) =>
          edge.target === target &&
          edge.targetHandle === targetHandle &&
          edge.id !== currentEdgeId
      )
      if (existingConnection) {
        return false // Target handle already has a connection
      }

      const targetNode = nodes.find((node) => node.id === target)
      const handles = targetNode ? getNodeHandles(targetNode.type, targetNode.data) : {}
      const rawInputs = handles.inputs
      const inputs: HandleMeta[] = Array.isArray(rawInputs) ? rawInputs : []
      const targetInput = inputs.find((input) => input.id === targetHandle)
      if (!targetInput) {
        return false
      }
      const allowedSourceIds = targetInput.allowedSourceIds || []
      if (allowedSourceIds.includes(sourceHandle)) {
        return true
      }

      const sourceKind = getKindFromSourceHandle(sourceHandle)
      if (!sourceKind || targetInput.type !== sourceKind) {
        return false
      }

      const canonicalHandleIdByKind = {
        text: OUTPUT_HANDLE_IDS.text,
        image: OUTPUT_HANDLE_IDS.image,
        video: OUTPUT_HANDLE_IDS.video,
      } as const

      return allowedSourceIds.includes(canonicalHandleIdByKind[sourceKind])
    },
    [nodes, edges, reconnectingEdgeId]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source)
      const targetNode = nodes.find((node) => node.id === connection.target)
      if (sourceNode?.type === 'veo-3.1-generate-preview' || targetNode?.type === 'veo-3.1-generate-preview') {
        console.log('[Workflow Editor][Edge Connect][Veo]', {
          connection,
          sourceType: sourceNode?.type,
          targetType: targetNode?.type,
        })
      }
      // Take snapshot before adding edge for undo support
      takeSnapshot(nodes, edges)
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            ...getEdgeVisualProps(connection.sourceHandle, isAnimated),
          },
          eds
        )
      )
    },
    [setEdges, isAnimated, nodes, edges, takeSnapshot]
  )

  const onEdgesChangeWithDebug = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      const relevantChanges = changes.map((change) => {
        const edgeId = 'id' in change ? change.id : undefined
        const existingEdge = edgeId ? edges.find((edge) => edge.id === edgeId) : undefined
        if (!existingEdge) return null

        const sourceNode = nodes.find((node) => node.id === existingEdge.source)
        const targetNode = nodes.find((node) => node.id === existingEdge.target)
        const isVeoRelated = sourceNode?.type === 'veo-3.1-generate-preview' || targetNode?.type === 'veo-3.1-generate-preview'
        if (!isVeoRelated) return null

        return {
          changeType: change.type,
          edgeId: existingEdge.id,
          source: existingEdge.source,
          sourceHandle: existingEdge.sourceHandle,
          sourceType: sourceNode?.type,
          target: existingEdge.target,
          targetHandle: existingEdge.targetHandle,
          targetType: targetNode?.type,
        }
      }).filter(Boolean)

      if (relevantChanges.length > 0) {
        console.log('[Workflow Editor][Edge Change][Veo]', relevantChanges)
      }

      onEdgesChange(changes)
    },
    [edges, nodes, onEdgesChange]
  )

  const onConnectStart = useCallback<OnConnectStart>((_, params) => {
    if (params.handleType === 'source') {
      setConnectingSourceHandle(params.handleId)
    }
  }, [])

  const onConnectEnd = useCallback(() => {
    setConnectingSourceHandle(null)
  }, [])

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === newConnection.source)
      const targetNode = nodes.find((node) => node.id === newConnection.target)
      if (sourceNode?.type === 'veo-3.1-generate-preview' || targetNode?.type === 'veo-3.1-generate-preview') {
        console.log('[Workflow Editor][Edge Reconnect][Veo]', {
          oldEdge: {
            id: oldEdge.id,
            source: oldEdge.source,
            sourceHandle: oldEdge.sourceHandle,
            target: oldEdge.target,
            targetHandle: oldEdge.targetHandle,
          },
          newConnection,
          sourceType: sourceNode?.type,
          targetType: targetNode?.type,
        })
      }
      setEdges((eds) => {
        const reconnectedEdges = reconnectEdge(oldEdge, newConnection, eds, { shouldReplaceId: false })

        return reconnectedEdges.map((edge) =>
          edge.id === oldEdge.id
            ? {
              ...edge,
              ...getEdgeVisualProps(newConnection.sourceHandle, isAnimated),
            }
            : edge
        )
      })
    },
    [setEdges, isAnimated, nodes]
  )

  const onReconnectStart = useCallback((_: React.MouseEvent, edge: Edge) => {
    setReconnectingEdgeId(edge.id)
    setConnectingSourceHandle(edge.sourceHandle ?? null)
  }, [])

  const onReconnectEnd = useCallback(() => {
    setReconnectingEdgeId(null)
    setConnectingSourceHandle(null)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const isFileDrag = Array.from(event.dataTransfer.types || []).includes('Files')
    event.dataTransfer.dropEffect = isFileDrag ? 'copy' : 'move'
  }, [])

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault()
      const dropX = event.clientX
      const dropY = event.clientY
      const files = Array.from(event.dataTransfer.files || [])
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))
      const videoFiles = files.filter((file) => file.type.startsWith('video/'))
      const oversizedVideoFiles = videoFiles.filter((file) => file.size > MAX_VIDEO_FILE_SIZE_BYTES)
      const validVideoFiles = videoFiles.filter((file) => file.size <= MAX_VIDEO_FILE_SIZE_BYTES)
      const mediaFiles = [...imageFiles, ...validVideoFiles]

      if (oversizedVideoFiles.length > 0) {
        toast.error(
          oversizedVideoFiles.length === 1
            ? `"${oversizedVideoFiles[0].name}" exceeds 200MB and was skipped.`
            : `${oversizedVideoFiles.length} videos exceeded 200MB and were skipped.`
        )
      }

      if (mediaFiles.length > 0) {
        if (!workflowId || workflowId === 'new') {
          toast.error('Please wait for the workflow to be ready before dropping files.')
          return
        }

        const basePosition = screenToFlowPosition({ x: dropX, y: dropY })
        const baseNodeMap = new Map(nodes.map((node) => [node.id, node]))
        for (let index = 0; index < mediaFiles.length; index += 1) {
          const file = mediaFiles[index]
          const isVideo = file.type.startsWith('video/')
          const localVideoBlobUrl = isVideo ? URL.createObjectURL(file) : ''
          const nodeType = isVideo ? 'videoUpload' : 'imageUpload'
          const nodeId = `${nodeType}-${Date.now()}-${index}`
          const absolutePosition = {
            x: basePosition.x + index * 36,
            y: basePosition.y + index * 28,
          }
          const targetGroup = findContainingGroup(absolutePosition, nodes)
          const groupAbsolute = targetGroup ? getAbsoluteNodePosition(targetGroup, baseNodeMap) : null
          const nodePosition = targetGroup && groupAbsolute
            ? {
              x: Math.round(absolutePosition.x - groupAbsolute.x),
              y: Math.round(absolutePosition.y - groupAbsolute.y),
            }
            : absolutePosition

          const newNode = {
            id: nodeId,
            type: nodeType,
            position: {
              x: nodePosition.x,
              y: nodePosition.y,
            },
            parentId: targetGroup?.id,
            extent: targetGroup ? ('parent' as const) : undefined,
            data: normalizeNodeHandleData(nodeType, {
              label: isVideo ? 'Video Upload' : 'Image Upload',
              ...(isVideo
                ? {
                  videoBlobUrl: localVideoBlobUrl,
                  videoUrl: localVideoBlobUrl,
                  output: localVideoBlobUrl,
                  assetPath: localVideoBlobUrl,
                }
                : {
                  imageUrl: '',
                }),
              ...(!isVideo ? { assetPath: '' } : {}),
              fileName: file.name,
              isUploading: true,
              uploadError: '',
              ...getNodeHandles(nodeType, {}),
              onUpdateNodeData: updateNodeData,
            }),
          } satisfies Node<WorkflowNodeData>

          // Take snapshot before adding node for undo support
          takeSnapshot(nodes, edges)
          setNodes((nds) => [...nds, newNode])

          void (async () => {
            const uploadResult = await uploadToR2(file, workflowId, nodeId, file.name)

            if (!uploadResult.success || !uploadResult.url) {
              updateNodeData(nodeId, {
                ...(isVideo
                  ? { videoUrl: localVideoBlobUrl, videoBlobUrl: localVideoBlobUrl, output: localVideoBlobUrl, assetPath: localVideoBlobUrl }
                  : { imageUrl: '' }),
                ...(isVideo ? {} : { assetPath: '' }),
                isUploading: false,
                uploadError: uploadResult.error || 'Upload failed',
              })
              toast.error(`Failed to upload "${file.name}"`)
              return
            }

            updateNodeData(nodeId, {
              ...(isVideo
                ? { videoUrl: uploadResult.url, videoBlobUrl: localVideoBlobUrl, output: uploadResult.url }
                : { imageUrl: uploadResult.url }),
              assetPath: uploadResult.url,
              fileName: file.name,
              isUploading: false,
              uploadError: '',
            })
          })()
        }

        const messages: string[] = []
        if (imageFiles.length > 0) {
          messages.push(imageFiles.length === 1 ? '1 image' : `${imageFiles.length} images`)
        }
        if (validVideoFiles.length > 0) {
          messages.push(validVideoFiles.length === 1 ? '1 video' : `${validVideoFiles.length} videos`)
        }
        toast.success(`${messages.join(' and ')} added to canvas`)

        return
      }

      const nodeType = event.dataTransfer.getData('application/reactflow')
      if (!nodeType) {
        return
      }

      const position = screenToFlowPosition({
        x: dropX,
        y: dropY,
      })
      const dropTargetGroup = findContainingGroup(position, nodes)
      const dropNodeMap = new Map(nodes.map((node) => [node.id, node]))
      const dropGroupAbsolute = dropTargetGroup ? getAbsoluteNodePosition(dropTargetGroup, dropNodeMap) : null
      const finalPosition = dropTargetGroup && dropGroupAbsolute
        ? {
          x: Math.round(position.x - dropGroupAbsolute.x),
          y: Math.round(position.y - dropGroupAbsolute.y),
        }
        : position

      const model = MODELS.find(m => m.id === nodeType) || TOOLS.find(t => t.id === nodeType);
      const newNode = {
        id: `${nodeType}-${Date.now()}`,
        type: nodeType,
        position: finalPosition,
        parentId: dropTargetGroup?.id,
        extent: dropTargetGroup ? ('parent' as const) : undefined,
        data: normalizeNodeHandleData(nodeType, {
          label: model?.title || nodeType,
          ...(nodeType === 'imagen-4.0-generate-001' && {
            prompt: '',
          }),
          ...(nodeType === 'textInput' && {
            text: '',
          }),
          ...(nodeType === 'imageUpload' && {
            imageUrl: '',
            fileName: '',
          }),
          ...(nodeType === 'videoUpload' && {
            videoUrl: '',
            videoBlobUrl: '',
            output: '',
            fileName: '',
            playheadTime: 0,
            videoDurationSeconds: 0,
            videoFps: 24,
            videoFrameIndex: 0,
          }),
          ...(nodeType === 'extractVideoFrame' && {
            output: '',
            imageOutput: '',
            connectedVideo: '',
            connectedVideoBlob: '',
            connectedVideoCurrentTime: 0,
            currentTime: 0,
            durationSeconds: 0,
            fps: 24,
            frameIndex: 0,
            timecode: '00:00:00',
          }),
          ...(nodeType === 'stickyNote' && {
            note: '',
            noteColor: 'yellow',
          }),
          ...(nodeType === 'imageDescriber' && {
            imageInputCount: 1,
            output: '',
            model: 'gemini-2.5-flash',
            systemInstruction: DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION,
          }),
          ...(nodeType === 'videoDescriber' && {
            output: '',
            model: 'gemini-2.5-flash',
            prompt: '',
            systemInstruction: DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION,
          }),
          ...(nodeType === 'promptEnhancer' && {
            output: '',
            imageInputCount: 1,
            model: 'gemini-2.5-flash',
            systemInstruction: DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION,
          }),
          ...(nodeType === 'promptConcatenator' && {
            output: '',
            additionalText: '',
            inputCount: 2,
          }),
          ...(nodeType === 'imageCompositor' && {
            output: '',
            imageOutput: '',
            layerCount: 2,
            canvasWidth: 960,
            canvasHeight: 960,
            backgroundColor: 'transparent',
            connectedBackground: '',
          }),
          ...(nodeType === 'gemini-2.5-flash-image' && {
            prompt: '',
            aspectRatio: '1:1',
          }),
          ...(nodeType === 'gemini-3-pro-image-preview' && {
            prompt: '',
            imageSize: '1K',
            useGoogleSearch: false,
          }),
          ...(nodeType === 'veo-3.1-generate-preview' && {
            prompt: '',
            resolution: '720p',
            durationSeconds: '8',
            aspectRatio: '16:9',
            imageInputCount: 0,
          }),
          ...(nodeType === 'colorGrading' && {
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
          }),
          ...(nodeType === 'crop' && {
            aspectRatio: 'free',
            cropWidth: 0,
            cropHeight: 0,
            lockAspect: true,
          }),
          ...(nodeType === 'painter' && {
            mode: 'brush',
            brushSize: 32,
            brushColor: '#ff0000',
            opacity: 1,
          }),
          ...getNodeHandles(nodeType, {}),
          onUpdateNodeData: updateNodeData,
        }),
      } satisfies Node<WorkflowNodeData>

      // Take snapshot before adding node for undo support
      takeSnapshot(nodes, edges)
      setNodes((nds) => [...nds, newNode])
    },
    [screenToFlowPosition, setNodes, updateNodeData, workflowId, nodes, edges, takeSnapshot]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNode(node)
    if (NODES_WITH_PROPERTIES.includes(node.type)) {
      setIsRightSidebarOpen(true)
    } else {
      setIsRightSidebarOpen(false)
    }
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setIsRightSidebarOpen(false)
  }, [])

  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node<WorkflowNodeData>) => {
    if (draggedNode.type === GROUP_NODE_TYPE) {
      return
    }

    const currentNodes = getNodes() as Node<WorkflowNodeData>[]
    const nodeMap = new Map(currentNodes.map((node) => [node.id, node]))
    const dragged = nodeMap.get(draggedNode.id)
    if (!dragged) return

    const draggedAbsolute = getAbsoluteNodePosition(dragged, nodeMap)
    const targetGroup = findContainingGroup(draggedAbsolute, currentNodes)

    if (targetGroup && isDescendantOf(targetGroup, dragged.id, nodeMap)) {
      return
    }

    setNodes((nodesState) => {
      const stateMap = new Map(nodesState.map((node) => [node.id, node]))
      const selectedNodes = nodesState.filter((node) => node.selected)
      const candidates = selectedNodes.length > 0 ? selectedNodes : [dragged]

      const resolvedTargetGroup = targetGroup
        ? stateMap.get(targetGroup.id) || targetGroup
        : null
      const resolvedGroupAbsolute = resolvedTargetGroup
        ? getAbsoluteNodePosition(resolvedTargetGroup, stateMap)
        : null

      const updated = nodesState.map((node) => {
        if (!candidates.find((candidate) => candidate.id === node.id)) {
          return node
        }

        const nodeAbsolute = getAbsoluteNodePosition(node, stateMap)
        if (resolvedTargetGroup) {
          if (node.parentId === resolvedTargetGroup.id) {
            return node
          }
          if (isDescendantOf(resolvedTargetGroup, node.id, stateMap)) {
            return node
          }
          return {
            ...node,
            parentId: resolvedTargetGroup.id,
            extent: 'parent' as const,
            position: {
              x: Math.round(nodeAbsolute.x - (resolvedGroupAbsolute?.x ?? 0)),
              y: Math.round(nodeAbsolute.y - (resolvedGroupAbsolute?.y ?? 0)),
            },
          }
        }

        if (node.parentId) {
          return {
            ...node,
            parentId: undefined,
            extent: undefined,
            position: {
              x: Math.round(nodeAbsolute.x),
              y: Math.round(nodeAbsolute.y),
            },
          }
        }

        return node
      })

      return updated
    })
  }, [getNodes, setNodes])

  const selectedGroupableNodes = React.useMemo(
    () => nodes.filter((node) => node.selected && node.type !== GROUP_NODE_TYPE),
    [nodes]
  )
  const selectedNodes = React.useMemo(
    () => nodes.filter((node) => node.selected),
    [nodes]
  )

  const handleGroupSelectedNodes = useCallback(() => {
    if (selectedGroupableNodes.length < 2) {
      toast.error('Select at least two nodes to create a group')
      return
    }

    const baseNodeMap = new Map(nodes.map((node) => [node.id, node]))
    const selectedIds = new Set(selectedGroupableNodes.map((node) => node.id))
    const rootNodes = selectedGroupableNodes.filter((node) => {
      let parentId = node.parentId
      while (parentId) {
        if (selectedIds.has(parentId)) {
          return false
        }
        const parent = baseNodeMap.get(parentId)
        if (!parent) break
        parentId = parent.parentId
      }
      return true
    })

    if (rootNodes.length < 2) {
      toast.error('Select at least two top-level nodes to create a group')
      return
    }

    const absoluteBounds = rootNodes.map((node) => {
      const absolute = getAbsoluteNodePosition(node, baseNodeMap)
      return {
        node,
        x: absolute.x,
        y: absolute.y,
        width: getNodeDimension(node, 'width'),
        height: getNodeDimension(node, 'height'),
      }
    })

    const minX = Math.min(...absoluteBounds.map((bounds) => bounds.x))
    const minY = Math.min(...absoluteBounds.map((bounds) => bounds.y))
    const maxX = Math.max(...absoluteBounds.map((bounds) => bounds.x + bounds.width))
    const maxY = Math.max(...absoluteBounds.map((bounds) => bounds.y + bounds.height))

    const groupX = Math.round(minX - GROUP_PADDING_X)
    const groupY = Math.round(minY - GROUP_PADDING_Y)
    const groupWidth = Math.round(Math.max(MIN_GROUP_WIDTH, maxX - minX + GROUP_PADDING_X * 2))
    const groupHeight = Math.round(Math.max(MIN_GROUP_HEIGHT, maxY - minY + GROUP_PADDING_Y * 2))
    const groupId = `${GROUP_NODE_TYPE}-${Date.now()}`

    const groupNode: Node<WorkflowNodeData> = {
      id: groupId,
      type: GROUP_NODE_TYPE,
      position: { x: groupX, y: groupY },
      data: normalizeNodeHandleData(GROUP_NODE_TYPE, {
        label: 'Group',
        title: 'Group',
      }),
      style: {
        width: groupWidth,
        height: groupHeight,
      },
      selected: true,
    }

    const groupedNodeIds = new Set(rootNodes.map((node) => node.id))
    takeSnapshot(nodes, edges)
    setNodes((currentNodes) => {
      const currentMap = new Map(currentNodes.map((node) => [node.id, node]))
      const reassigned = currentNodes.map((node) => {
        if (!groupedNodeIds.has(node.id)) {
          return {
            ...node,
            selected: false,
          }
        }

        const absolute = getAbsoluteNodePosition(node, currentMap)
        return {
          ...node,
          parentId: groupId,
          extent: 'parent' as const,
          position: {
            x: Math.round(absolute.x - groupX),
            y: Math.round(absolute.y - groupY),
          },
          selected: false,
        }
      })

      const groupedChildren = reassigned.filter((node) => groupedNodeIds.has(node.id))
      const otherNodes = reassigned.filter((node) => !groupedNodeIds.has(node.id))
      return [...otherNodes, groupNode, ...groupedChildren]
    })

    setSelectedNode(groupNode)
    setIsRightSidebarOpen(false)
    toast.success('Grouped selected nodes')
  }, [edges, nodes, selectedGroupableNodes, setNodes, takeSnapshot])

  const handleDeleteSelection = useCallback(() => {
    if (selectedNodes.length === 0) {
      return
    }
    takeSnapshot(nodes, edges)
    const selectedIds = new Set(selectedNodes.map((node) => node.id))
    setNodes((currentNodes) => currentNodes.filter((node) => !selectedIds.has(node.id)))
    setSelectedNode(null)
    setIsRightSidebarOpen(false)
    toast.success('Deleted selected nodes')
  }, [edges, nodes, selectedNodes, setNodes, takeSnapshot])

  const handleDuplicateSelection = useCallback(() => {
    if (selectedNodes.length === 0) {
      return
    }

    const selectedIds = new Set(selectedNodes.map((node) => node.id))
    const idMap = new Map<string, string>()
    selectedNodes.forEach((node, index) => {
      idMap.set(node.id, `${node.type}-${Date.now()}-${index}`)
    })

    // Calculate bounding box of selected nodes to find non-overlapping position
    const topLevelSelected = selectedNodes.filter(n => !n.parentId || !selectedIds.has(n.parentId))
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Get bounding box dimensions
    const getNodeDim = (node: Node<WorkflowNodeData>, axis: 'width' | 'height'): number => {
      const measured = (node as any)?.measured
      if (axis === 'width') {
        return Math.max(1, Math.round(
          (typeof node?.width === 'number' ? node.width : undefined) ??
          (typeof measured?.width === 'number' ? measured.width : undefined) ?? 320
        ))
      }
      return Math.max(1, Math.round(
        (typeof node?.height === 'number' ? node.height : undefined) ??
        (typeof measured?.height === 'number' ? measured.height : undefined) ?? 180
      ))
    }

    const getAbsPos = (node: Node<WorkflowNodeData>): { x: number; y: number } => {
      let x = node.position.x
      let y = node.position.y
      let parentId = node.parentId
      while (parentId) {
        const parent = nodeMap.get(parentId)
        if (!parent) break
        x += parent.position.x
        y += parent.position.y
        parentId = parent.parentId
      }
      return { x, y }
    }

    // Calculate bounding box
    const positions = topLevelSelected.map(node => {
      const abs = getAbsPos(node)
      return { x: abs.x, y: abs.y, width: getNodeDim(node, 'width'), height: getNodeDim(node, 'height') }
    })
    const minX = Math.min(...positions.map(p => p.x))
    const minY = Math.min(...positions.map(p => p.y))
    const maxX = Math.max(...positions.map(p => p.x + p.width))
    const maxY = Math.max(...positions.map(p => p.y + p.height))
    const boundsWidth = maxX - minX
    const boundsHeight = maxY - minY

    // Check collision helper with minimum dimensions
    const nodeWidth = Math.max(boundsWidth, 320)
    const nodeHeight = Math.max(boundsHeight, 180)

    const checkCollision = (testX: number, testY: number): boolean => {
      const padding = 20
      return nodes.some(node => {
        if (selectedIds.has(node.id)) return false
        const abs = getAbsPos(node)
        const w = getNodeDim(node, 'width')
        const h = getNodeDim(node, 'height')
        return !(testX + nodeWidth + padding < abs.x || testX > abs.x + w + padding ||
          testY + nodeHeight + padding < abs.y || testY > abs.y + h + padding)
      })
    }

    // Find non-overlapping offset (prefer right, then bottom, etc.)
    const gap = 40
    const baseOffsets = [
      { x: nodeWidth + gap, y: 0 },
      { x: 0, y: nodeHeight + gap },
      { x: -(nodeWidth + gap), y: 0 },
      { x: 0, y: -(nodeHeight + gap) },
      { x: nodeWidth + gap, y: nodeHeight + gap },
      { x: -(nodeWidth + gap), y: nodeHeight + gap },
      { x: nodeWidth + gap, y: -(nodeHeight + gap) },
    ]

    let offset = { x: (nodeWidth + gap) * 11, y: 0 } // Ultimate fallback

    // Try base positions first
    for (const off of baseOffsets) {
      if (!checkCollision(minX + off.x, minY + off.y)) {
        offset = off
        break
      }
    }

    // If all base positions blocked, try incrementing to the right
    if (offset.x === (nodeWidth + gap) * 11) {
      for (let multiplier = 2; multiplier <= 10; multiplier++) {
        const testOffset = { x: (nodeWidth + gap) * multiplier, y: 0 }
        if (!checkCollision(minX + testOffset.x, minY + testOffset.y)) {
          offset = testOffset
          break
        }
      }
    }

    const duplicatedNodes = selectedNodes.map((node) => {
      const mappedParentId = node.parentId && selectedIds.has(node.parentId)
        ? idMap.get(node.parentId)
        : node.parentId

      const isTopLevel = !mappedParentId
      return {
        ...node,
        id: idMap.get(node.id) || `${node.type}-${Date.now()}`,
        position: {
          x: node.position.x + (isTopLevel ? offset.x : 0),
          y: node.position.y + (isTopLevel ? offset.y : 0),
        },
        parentId: mappedParentId,
        selected: true,
      }
    })

    const duplicatedEdges = edges
      .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
      .map((edge, index) => ({
        ...edge,
        id: `${edge.id}-copy-${Date.now()}-${index}`,
        source: idMap.get(edge.source) || edge.source,
        target: idMap.get(edge.target) || edge.target,
        selected: false,
      }))

    takeSnapshot(nodes, edges)
    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      ...duplicatedNodes,
    ])
    if (duplicatedEdges.length > 0) {
      setEdges((currentEdges) => [...currentEdges, ...duplicatedEdges])
    }
    toast.success('Duplicated selected nodes')
  }, [edges, nodes, selectedNodes, setEdges, setNodes, takeSnapshot])

  const handleCopySelection = useCallback(async () => {
    if (selectedNodes.length === 0) {
      return
    }

    // Helper to get group children
    const getGroupDescendants = (groupId: string): typeof nodes => {
      const children = nodes.filter(n => n.parentId === groupId)
      const descendants = [...children]
      children.forEach(child => {
        if (child.type === 'workflowGroup') {
          descendants.push(...getGroupDescendants(child.id))
        }
      })
      return descendants
    }

    // Include children of any selected groups
    let nodesToCopy = [...selectedNodes]
    selectedNodes.forEach(n => {
      if (n.type === 'workflowGroup') {
        const descendants = getGroupDescendants(n.id)
        descendants.forEach(d => {
          if (!nodesToCopy.find(nd => nd.id === d.id)) {
            nodesToCopy.push(d)
          }
        })
      }
    })

    const copyNodeIds = new Set(nodesToCopy.map(n => n.id))

    // Find edges connecting copied nodes
    const edgesToCopy = edges.filter(e =>
      copyNodeIds.has(e.source) && copyNodeIds.has(e.target)
    )

    try {
      const clipboardData = { nodes: nodesToCopy, edges: edgesToCopy }
      await navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2))
      toast.success(nodesToCopy.length > 1 ? "Selection copied" : "Node copied")
    } catch (err) {
      console.error('Copy failed:', err)
      toast.error("Failed to copy")
    }
  }, [edges, nodes, selectedNodes])

  const addNode = useCallback((nodeType: string) => {
    const model = MODELS.find(m => m.id === nodeType) || TOOLS.find(t => t.id === nodeType);
    const selectedGroups = nodes.filter((node) => node.selected && node.type === GROUP_NODE_TYPE)
    const targetGroup = selectedGroups.length === 1 ? selectedGroups[0] : null
    const defaultWidth = 320
    const defaultHeight = 180
    const groupPadding = 24
    const groupWidth = targetGroup ? getNodeDimensionWithStyle(targetGroup, 'width') : 0
    const groupHeight = targetGroup ? getNodeDimensionWithStyle(targetGroup, 'height') : 0
    const maxX = Math.max(groupPadding, groupWidth - groupPadding - defaultWidth)
    const maxY = Math.max(groupPadding, groupHeight - groupPadding - defaultHeight)
    const relativeX = targetGroup
      ? Math.round(maxX <= groupPadding ? groupPadding : groupPadding + Math.random() * (maxX - groupPadding))
      : 0
    const relativeY = targetGroup
      ? Math.round(maxY <= groupPadding ? groupPadding : groupPadding + Math.random() * (maxY - groupPadding))
      : 0
    const position = targetGroup
      ? {
        x: relativeX,
        y: relativeY,
      }
      : {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      }
    const newNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position,
      parentId: targetGroup?.id,
      extent: targetGroup ? ('parent' as const) : undefined,
      data: normalizeNodeHandleData(nodeType, {
        label: model?.title || nodeType,
        ...(nodeType === 'imagen-4.0-generate-001' && {
          prompt: '',
        }),
        ...(nodeType === 'textInput' && {
          text: '',
        }),
        ...(nodeType === 'imageUpload' && {
          imageUrl: '',
          fileName: '',
        }),
        ...(nodeType === 'videoUpload' && {
          videoUrl: '',
          videoBlobUrl: '',
          output: '',
          fileName: '',
          playheadTime: 0,
          videoDurationSeconds: 0,
          videoFps: 24,
          videoFrameIndex: 0,
        }),
        ...(nodeType === 'extractVideoFrame' && {
          output: '',
          imageOutput: '',
          connectedVideo: '',
          connectedVideoBlob: '',
          connectedVideoCurrentTime: 0,
          currentTime: 0,
          durationSeconds: 0,
          fps: 24,
          frameIndex: 0,
          timecode: '00:00:00',
        }),
        ...(nodeType === 'stickyNote' && {
          note: '',
          noteColor: 'yellow',
        }),
        ...(nodeType === 'imageDescriber' && {
          imageInputCount: 1,
          output: '',
          model: 'gemini-2.5-flash',
          systemInstruction: DEFAULT_IMAGE_DESCRIBER_SYSTEM_INSTRUCTION,
        }),
        ...(nodeType === 'videoDescriber' && {
          output: '',
          model: 'gemini-2.5-flash',
          prompt: '',
          systemInstruction: DEFAULT_VIDEO_DESCRIBER_SYSTEM_INSTRUCTION,
        }),
        ...(nodeType === 'promptEnhancer' && {
          output: '',
          imageInputCount: 1,
          model: 'gemini-2.5-flash',
          systemInstruction: DEFAULT_PROMPT_ENHANCER_SYSTEM_INSTRUCTION,
        }),
        ...(nodeType === 'promptConcatenator' && {
          output: '',
          additionalText: '',
          inputCount: 2,
        }),
        ...(nodeType === 'imageCompositor' && {
          output: '',
          imageOutput: '',
          layerCount: 2,
          canvasWidth: 960,
          canvasHeight: 960,
          backgroundColor: 'transparent',
          connectedBackground: '',
        }),
        ...(nodeType === 'gemini-2.5-flash-image' && {
          prompt: '',
          aspectRatio: '1:1',
        }),
        ...(nodeType === 'gemini-3-pro-image-preview' && {
          prompt: '',
          imageSize: '1K',
          useGoogleSearch: false,
        }),
        ...(nodeType === 'veo-3.1-generate-preview' && {
          prompt: '',
          resolution: '720p',
          durationSeconds: '8',
          aspectRatio: '16:9',
          imageInputCount: 0,
        }),
        ...(nodeType === 'colorGrading' && {
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
        }),
        ...(nodeType === 'crop' && {
          aspectRatio: 'free',
          cropWidth: 0,
          cropHeight: 0,
          lockAspect: true,
        }),
        ...(nodeType === 'painter' && {
          mode: 'brush',
          brushSize: 32,
          brushColor: '#ff0000',
          opacity: 1,
        }),
        ...getNodeHandles(nodeType),
        onUpdateNodeData: updateNodeData,
      }),
    } satisfies Node<WorkflowNodeData>
    // Take snapshot before adding node for undo support
    takeSnapshot(nodes, edges)
    setNodes((nds) => [...nds, newNode])
  }, [setNodes, updateNodeData, nodes, edges, takeSnapshot])

  const handleManualSave = useCallback(async () => {
    if (!workflowId) return

    try {
      // console.log('[Workflow Editor] Manual save started', { workflowId })
      const viewport = getViewport()
      const { nodes: safeNodes, edges: safeEdges } = getSerializableGraph(nodes, edges)

      const response = await saveWorkflow(workflowId, safeNodes, safeEdges, viewport)
      if (response.success) {
        // console.log('[Workflow Editor] Manual save triggering thumbnail generation', { workflowId })
        await generateThumbnail()
        toast.success('Workflow saved successfully')
        // console.log('[Workflow Editor] Manually saved workflow:', workflowId)
      } else {
        toast.error(`Failed to save workflow: ${response.error}`)
      }
    } catch {
      // console.error('[Workflow Editor] Manual save error:', error)
      toast.error('An error occurred while saving')
    }
  }, [workflowId, getViewport, getSerializableGraph, nodes, edges, saveWorkflow, generateThumbnail])

  const handleBackToDashboard = useCallback(async () => {
    // Auto-save before navigating back
    if (workflowId) {
      try {
        const viewport = getViewport()
        const { nodes: safeNodes, edges: safeEdges } = getSerializableGraph(nodes, edges)

        await saveWorkflow(workflowId, safeNodes, safeEdges, viewport)
        console.log('[Workflow Editor] Auto-saved before navigation')
      } catch (error) {
        console.error('[Workflow Editor] Auto-save before navigation failed:', error)
      }
    }
    router.push('/dashboard')
  }, [workflowId, getViewport, getSerializableGraph, nodes, edges, saveWorkflow, router])

  const handleDuplicate = async () => {
    if (!workflowId) return
    try {
      const response = await duplicateWorkflow(workflowId)
      if (response.success && response.data) {
        toast.success('Workflow duplicated')
        router.push(`/editor/${response.data.id}`)
      } else {
        toast.error('Failed to duplicate workflow')
      }
    } catch (err) {
      toast.error('Error duplicating workflow')
    }
  }

  const handleRenameSubmit = async () => {
    if (!workflowId || !newName.trim()) return
    try {
      const response = await renameWorkflow(workflowId, newName)
      if (response.success) {
        toast.success("Workflow renamed successfully")
        setWorkflowName(newName)
        setIsRenameDialogOpen(false)
      } else {
        toast.error('Failed to rename workflow')
      }
    } catch (error) {
      toast.error('Failed to rename workflow')
    }
  }

  const handleTitleSave = async (customName?: string) => {
    if (!workflowId) return

    // Use custom name (from sidebar) or current state (from canvas input)
    const nameToUse = customName !== undefined ? customName : workflowName
    const nameToSave = nameToUse.trim() || "Untitled Workflow"

    try {
      const response = await renameWorkflow(workflowId, nameToSave)
      if (response.success) {
        setIsEditingName(false)
        setWorkflowName(nameToSave)
        toast.success("Workflow renamed")
      } else {
        toast.error('Failed to rename workflow')
      }
    } catch (error) {
      toast.error('Failed to rename workflow')
    }
  }

  const handleDelete = async () => {
    if (!workflowId) return
    if (!confirm('Are you sure you want to delete this workflow? This cannot be undone.')) return
    try {
      const response = await deleteWorkflow(workflowId)
      if (response.success) {
        toast.success('Workflow deleted')
        router.push('/dashboard')
      } else {
        toast.error('Failed to delete workflow')
      }
    } catch (error) {
      toast.error('Failed to delete workflow')
    }
  }

  const handleNew = useCallback(async () => {
    // Auto-save before creating new
    if (workflowId && nodes.length > 0) {
      try {
        const viewport = getViewport()
        const { nodes: safeNodes, edges: safeEdges } = getSerializableGraph(nodes, edges)

        await saveWorkflow(workflowId, safeNodes, safeEdges, viewport)
        console.log('[Workflow Editor] Auto-saved before creating new project')
      } catch (error) {
        console.error('[Workflow Editor] Auto-save before new project failed:', error)
        toast.error('Failed to save current workflow')
      }
    }
    router.push('/editor/new')
  }, [workflowId, getViewport, getSerializableGraph, nodes, edges, saveWorkflow, router])

  const handlePaste = useCallback(
    async (position?: { x: number; y: number }) => {
      try {
        const text = await navigator.clipboard.readText()
        if (!text) return

        const data = JSON.parse(text)

        // Calculate paste position offset
        let pasteOffset = position
        if (!pasteOffset) {
          // Paste at center of viewport if no position provided (keyboard shortcut)
          const viewport = getViewport()
          if (reactFlowWrapper.current) {
            const { width, height } = reactFlowWrapper.current.getBoundingClientRect()
            pasteOffset = {
              x: (-viewport.x + width / 2) / viewport.zoom,
              y: (-viewport.y + height / 2) / viewport.zoom
            }
          } else {
            pasteOffset = { x: 0, y: 0 }
          }
        }

        // Handle new format: { nodes: [...], edges: [...] }
        if (data.nodes && Array.isArray(data.nodes)) {
          const nodesToPaste = data.nodes as any[]
          const edgesToPaste = (data.edges || []) as any[]

          if (nodesToPaste.length === 0) return

          // Find the top-left corner of the copied nodes to calculate offset
          const minX = Math.min(...nodesToPaste.filter(n => !n.parentId).map(n => n.position?.x ?? 0))
          const minY = Math.min(...nodesToPaste.filter(n => !n.parentId).map(n => n.position?.y ?? 0))

          // Create ID mapping for all nodes
          const idMap = new Map<string, string>()
          nodesToPaste.forEach((node, index) => {
            idMap.set(node.id, `${node.type}-${Date.now()}-${index}`)
          })

          // Create pasted nodes with new IDs and positions
          const pastedNodes = nodesToPaste.map((node) => {
            const newId = idMap.get(node.id) || `${node.type}-${Date.now()}`
            const mappedParentId = node.parentId && idMap.has(node.parentId)
              ? idMap.get(node.parentId)
              : node.parentId

            // Only add "Copy of" prefix to group titles
            let nodeData = { ...node.data }
            if (node.type === 'workflowGroup' && nodeData.title) {
              nodeData = {
                ...nodeData,
                title: `Copy of ${nodeData.title}`,
                label: `Copy of ${nodeData.label || nodeData.title}`,
              }
            }

            // Calculate new position: offset from original min position to paste position
            const newPosition = mappedParentId
              ? { x: node.position.x, y: node.position.y } // Keep relative position for children
              : {
                x: pasteOffset!.x + (node.position.x - minX),
                y: pasteOffset!.y + (node.position.y - minY),
              }

            return {
              ...node,
              id: newId,
              position: newPosition,
              parentId: mappedParentId,
              selected: !mappedParentId, // Only select top-level nodes
              data: nodeData,
            }
          })

          // Create pasted edges with remapped IDs
          const pastedEdges = edgesToPaste.map((edge, index) => ({
            ...edge,
            id: `edge-${Date.now()}-${index}`,
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
          }))

          setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(pastedNodes))
          setEdges((eds) => [...eds, ...pastedEdges])
          toast.success(nodesToPaste.length > 1 ? "Selection pasted" : "Node pasted")
          return
        }

        // Handle legacy format: single node object
        if (!data.id || !data.type) return

        const newNode = {
          ...data,
          id: `${data.type}-${Date.now()}`,
          position: pasteOffset,
          selected: true,
          data: {
            ...data.data,
            // Only add prefix for groups
            ...(data.type === 'workflowGroup' && data.data?.title ? {
              title: `Copy of ${data.data.title}`,
              label: `Copy of ${data.data.label || data.data.title}`,
            } : {}),
          },
        }

        setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNode))
        toast.success("Node pasted")
      } catch (err) {
        console.error('Paste error:', err)
        // items might not be a node
      }
    },
    [getViewport, setNodes, setEdges, screenToFlowPosition]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Copy: Cmd+C / Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const selectedNodes = nodes.filter(n => n.selected)
        if (selectedNodes.length > 0) {
          e.preventDefault()
          try {
            // Helper to get group children
            const getGroupDescendants = (groupId: string): typeof nodes => {
              const children = nodes.filter(n => n.parentId === groupId)
              const descendants = [...children]
              children.forEach(child => {
                if (child.type === 'workflowGroup') {
                  descendants.push(...getGroupDescendants(child.id))
                }
              })
              return descendants
            }

            // Include children of any selected groups
            let nodesToCopy = [...selectedNodes]
            selectedNodes.forEach(n => {
              if (n.type === 'workflowGroup') {
                const descendants = getGroupDescendants(n.id)
                descendants.forEach(d => {
                  if (!nodesToCopy.find(nd => nd.id === d.id)) {
                    nodesToCopy.push(d)
                  }
                })
              }
            })

            const copyNodeIds = new Set(nodesToCopy.map(n => n.id))

            // Find edges connecting copied nodes
            const edgesToCopy = edges.filter(e =>
              copyNodeIds.has(e.source) && copyNodeIds.has(e.target)
            )

            const clipboardData = { nodes: nodesToCopy, edges: edgesToCopy }
            await navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2))
            toast.success(nodesToCopy.length > 1 ? "Selection copied" : "Node copied")
          } catch (err) {
            console.error('Copy failed:', err)
            toast.error("Failed to copy")
          }
        }
      }

      // Paste: Cmd+V / Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault()
        handlePaste()
      }

      // Group selection: Cmd+G / Ctrl+G
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (interactionMode !== 'select') {
          setInteractionMode('select')
        }
        handleGroupSelectedNodes()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleGroupSelectedNodes, handlePaste, interactionMode, nodes, edges])

  return (
    <div className="relative flex h-screen w-full bg-background">
      {/* Minimal left sidebar with logo, search, layers - always visible */}
      <EditorSidebar
        onSearchClick={() => setIsLibraryOpen(true)}
        onLayersClick={() => setIsLibraryOpen(!isLibraryOpen)}
        onSave={handleManualSave}
        onBackToDashboard={handleBackToDashboard}
        onDuplicate={handleDuplicate}
        onRename={() => {
          setNewName(workflowName)
          setIsRenameDialogOpen(true)
        }}
        onExport={() => setIsExportDialogOpen(true)}
        onShare={() => setIsShareDialogOpen(true)}
        onImport={() => setIsImportDialogOpen(true)}
        onDelete={handleDelete}
        onNew={handleNew}
        isLibraryOpen={isLibraryOpen}
      />

      {/* Full width canvas area */}
      <div className="flex-1 relative">
        {/* Top Left Title Bar - Hidden when library is open */}
        {!isLibraryOpen && (
          <div className="absolute top-4 left-4 z-50">
            <div className="bg-background/80 backdrop-blur-sm border shadow-sm rounded-md px-4 h-9 flex items-center min-w-[200px]">
              {isEditingName ? (
                <Input
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  onBlur={() => handleTitleSave()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleTitleSave()
                    }
                  }}
                  className="h-7 px-2 border-none focus-visible:ring-0 bg-transparent text-foreground font-medium"
                  autoFocus
                />
              ) : (
                <span
                  onClick={() => setIsEditingName(true)}
                  className="font-medium cursor-text w-full truncate text-foreground hover:text-foreground/80 transition-colors"
                >
                  {workflowName || "Untitled Workflow"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Top Right Action Bar - Hidden when properties sidebar is open.
            On mobile, also hide while node library is open to avoid covering its close button. */}
        {!isRightSidebarOpen && (!isLibraryOpen || !isMobile) && (
          <div className="absolute top-4 right-4 z-50 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="shadow-sm bg-background/80 backdrop-blur-sm h-9 px-4"
              onClick={() => setIsShareDialogOpen(true)}
              disabled={!workflowId || workflowId === 'new'}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shadow-sm bg-background/80 backdrop-blur-sm h-9 px-4"
              onClick={() => setIsExportDialogOpen(true)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        )}

        <div className="w-full h-full" ref={reactFlowWrapper}>
          <PaneContextMenu
            onPaste={handlePaste}
            selectedNodeCount={selectedNodes.length}
            onGroupSelection={handleGroupSelectedNodes}
            onCopySelection={handleCopySelection}
            onDuplicateSelection={handleDuplicateSelection}
            onDeleteSelection={handleDeleteSelection}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChangeWithSnapshot}
              onEdgesChange={onEdgesChangeWithSnapshot}
              onConnect={onConnect}
              onReconnect={onReconnect}
              isValidConnection={isValidConnection}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onReconnectStart={onReconnectStart}
              onReconnectEnd={onReconnectEnd}
              onNodeClick={onNodeClick}
              onNodeDragStop={onNodeDragStop}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault()
                setEdgeContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  edgeId: edge.id,
                })
              }}
              onPaneClick={() => {
                setEdgeContextMenu(null)
                onPaneClick()
              }}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={workflowNodeTypes}
              edgesReconnectable
              selectionOnDrag={interactionMode === 'select'}
              selectionMode={SelectionMode.Partial}
              panOnDrag={interactionMode === 'pan' ? true : [1, 2]}
              panOnScroll={interactionMode === 'select'}
              nodesDraggable={interactionMode === 'select'}
              elementsSelectable={interactionMode === 'select'}
              connectionLineStyle={{
                stroke: getEdgeColorFromSourceHandle(connectingSourceHandle),
              }}
              minZoom={0.05}
              maxZoom={10}
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick
              fitView
              className="bg-background"
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls position="bottom-center">
                <ControlButton
                  onClick={() => setInteractionMode('select')}
                  title="Select mode"
                  aria-label="Select mode"
                  className={interactionMode === 'select' ? "!bg-accent !border-border !text-accent-foreground" : ""}
                >
                  <MousePointer2 className={`h-4 w-4 ${interactionMode === 'select' ? 'text-foreground' : 'text-muted-foreground'}`} />
                </ControlButton>
                <ControlButton
                  onClick={() => setInteractionMode('pan')}
                  title="Pan mode"
                  aria-label="Pan mode"
                  className={interactionMode === 'pan' ? "!bg-accent !border-border !text-accent-foreground" : ""}
                >
                  <Hand className={`h-4 w-4 ${interactionMode === 'pan' ? 'text-foreground' : 'text-muted-foreground'}`} />
                </ControlButton>
                <ControlButton
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Undo (Cmd+Z)"
                  aria-label="Undo (Cmd+Z)"
                  className={!canUndo ? "opacity-50 cursor-not-allowed" : ""}
                >
                  <Undo2
                    className={`h-4 w-4 ${!canUndo ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
                  />
                </ControlButton>
                <ControlButton
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="Redo (Cmd+Shift+Z)"
                  aria-label="Redo (Cmd+Shift+Z)"
                  className={!canRedo ? "opacity-50 cursor-not-allowed" : ""}
                >
                  <Redo2
                    className={`h-4 w-4 ${!canRedo ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
                  />
                </ControlButton>
                <ControlButton
                  onClick={toggleAnimation}
                  title={isAnimated ? "Disable Animated Edges" : "Enable Animated Edges"}
                  aria-label={isAnimated ? "Disable animated edges" : "Enable animated edges"}
                  className={isAnimated ? "!bg-blue-500 !border-blue-500 hover:!bg-blue-600" : ""}
                >
                  <Activity
                    className={`h-4 w-4 ${isAnimated ? 'text-white' : 'text-muted-foreground'}`}
                  />
                </ControlButton>
              </Controls>
            </ReactFlow>
          </PaneContextMenu>

          {/* Edge Context Menu */}
          {edgeContextMenu && reactFlowWrapper.current && (
            <div
              className="absolute z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[120px]"
              style={{
                left: edgeContextMenu.x - reactFlowWrapper.current.getBoundingClientRect().left,
                top: edgeContextMenu.y - reactFlowWrapper.current.getBoundingClientRect().top,
              }}
              onMouseLeave={() => setEdgeContextMenu(null)}
            >
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                onClick={() => {
                  const edgeToDelete = edges.find((e) => e.id === edgeContextMenu.edgeId)
                  if (edgeToDelete) {
                    const sourceNode = nodes.find((node) => node.id === edgeToDelete.source)
                    const targetNode = nodes.find((node) => node.id === edgeToDelete.target)
                    if (sourceNode?.type === 'veo-3.1-generate-preview' || targetNode?.type === 'veo-3.1-generate-preview') {
                      console.log('[Workflow Editor][Edge Delete][Veo]', {
                        edgeId: edgeToDelete.id,
                        source: edgeToDelete.source,
                        sourceHandle: edgeToDelete.sourceHandle,
                        sourceType: sourceNode?.type,
                        target: edgeToDelete.target,
                        targetHandle: edgeToDelete.targetHandle,
                        targetType: targetNode?.type,
                      })
                    }
                  }
                  setEdges((edges) => edges.filter((e) => e.id !== edgeContextMenu.edgeId))
                  setEdgeContextMenu(null)
                  toast.success('Edge deleted')
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Node Library - slides from left, positioned after icon bar */}
        <NodeLibrary
          onAddNode={addNode}
          onClose={() => setIsLibraryOpen(false)}
          isOpen={isLibraryOpen}
          workflowName={workflowName}
          onRename={(newName) => handleTitleSave(newName)}
        />

        {/* Right sidebar for node properties */}
        <NodeProperties
          node={selectedNode}
          onUpdateNode={updateNodeData}
          isOpen={isRightSidebarOpen}
          onShare={() => setIsShareDialogOpen(true)}
          canShare={Boolean(workflowId && workflowId !== 'new')}
          onExport={() => setIsExportDialogOpen(true)}
          onClose={() => {
            setIsRightSidebarOpen(false)
            setSelectedNode(null)
          }}
        />
        {/* Dialogs */}
        <ExportDialog
          isOpen={isExportDialogOpen}
          onClose={() => setIsExportDialogOpen(false)}
          workflowId={workflowId}
          workflowName={workflowName || "Workflow"}
          getWorkflowData={() => ({
            nodes: getNodes(),
            edges: getEdges(),
            viewport: getViewport(),
          })}
        />
        <ImportDialog
          isOpen={isImportDialogOpen}
          onClose={() => setIsImportDialogOpen(false)}
        />
        <ShareDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          workflowId={workflowId}
        />

        {/* Rename Dialog */}
        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Rename Workflow</DialogTitle>
              <DialogDescription>
                Enter a new name for your workflow.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="col-span-3"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRenameSubmit()
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" onClick={handleRenameSubmit}>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isInitialGraphLoading && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading workflow...</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner />
    </ReactFlowProvider>
  )
}
