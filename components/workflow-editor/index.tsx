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
  type Node,
  type IsValidConnection,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, Download, Loader2, Share2 } from 'lucide-react'
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
import { MODELS, OUTPUT_HANDLE_IDS } from '@/data/models'
import { TOOLS } from '@/data/tools'
import { PaneContextMenu } from './pane-context-menu'

const NODES_WITH_PROPERTIES = [
  'imagen-4.0-generate-001',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'veo-3.1-generate-preview',
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

const EDGE_COLORS = {
  text: '#38bdf8', // sky-400
  image: '#34d399', // emerald-400
  video: '#a78bfa', // violet-400
  default: '#94a3b8', // slate-400
} as const
const EDGE_STROKE_WIDTH = 2.5
const EDGE_MARKER_SIZE = 16
const EDGE_INTERACTION_WIDTH = 28

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

const RUNTIME_ONLY_TOOL_NODE_TYPES = new Set(['blur', 'colorGrading', 'crop'])

function stripRuntimeDataFromNodeData(nodeType: string | undefined, data: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'function') {
      continue
    }

    // Connection payloads are derived from edges and can be rebuilt at runtime.
    if (
      key === 'connectedPrompt' ||
      key === 'connectedVideo' ||
      key.startsWith('connectedImage') ||
      key.startsWith('connectedRefImage')
    ) {
      continue
    }

    // Blob URLs are runtime-only and invalid after reload.
    if (typeof value === 'string' && value.startsWith('blob:')) {
      continue
    }

    if (
      RUNTIME_ONLY_TOOL_NODE_TYPES.has(nodeType || '') &&
      (key === 'output' || key === 'imageOutput' || key === 'videoOutput' || key === 'getOutput')
    ) {
      continue
    }

    cleaned[key] = value
  }

  return cleaned
}

function getNodeHandles(nodeType: string | undefined, data?: any): NodeHandleMeta {
  if (!nodeType) return { inputs: [], outputs: [] }

  const model = MODELS.find(m => m.id === nodeType) || TOOLS.find(t => t.id === nodeType);
  if (!model) return { inputs: [], outputs: [] };

  const inputs = [...(model.inputs || [])];
  const outputs = [...(model.outputs || [])];

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
  }

  return { inputs, outputs };
}

function WorkflowEditorInner() {
  const params = useParams()
  const router = useRouter()
  const workflowId = params.id as string

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [isLibraryOpen, setIsLibraryOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [connectingSourceHandle, setConnectingSourceHandle] = useState<string | null>(null)
  const [reconnectingEdgeId, setReconnectingEdgeId] = useState<string | null>(null)
  const [isAnimated, setIsAnimated] = useState(true)
  const { screenToFlowPosition, setViewport, getViewport, getNodes, getEdges } = useReactFlow()
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [newName, setNewName] = useState("")
  const [workflowName, setWorkflowName] = useState("")
  const [isInitialGraphLoading, setIsInitialGraphLoading] = useState(true)

  const { createWorkflow, loadWorkflow, saveWorkflow, renameWorkflow, deleteWorkflow, duplicateWorkflow, isLoading } = useWorkflow()

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
              const rawData = (node.data || {}) as Record<string, unknown>
              return {
                ...node,
                data: stripRuntimeDataFromNodeData(node.type, rawData),
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

    try {
      // Extended delay to ensure all images are loaded
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
      } catch (primaryError) {
        console.warn('[Workflow Editor] Primary thumbnail capture failed, retrying with safe options:', primaryError)
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

      if (!workflowId || workflowId === 'new') {
        console.log('[Workflow Editor] persistent ID required for thumbnail generation')
        return
      }

      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch(`/api/workflows/${workflowId}/thumbnail`, {
        method: 'POST',
        body: formData,
      })

      if (uploadRes.ok) {
        console.log('[Workflow Editor] Thumbnail updated')
        lastThumbnailTimeRef.current = Date.now()
      } else {
        const errorText = await uploadRes.text()
        console.error('[Workflow Editor] Failed to update thumbnail:', errorText)
      }
    } catch (error) {
      console.error('[Workflow Editor] Thumbnail generation error:', error instanceof Error ? error.message : error)
      // Don't throw - allow the app to continue if thumbnail fails
    }
  }, [workflowId])

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

        console.log('[Workflow Editor] Auto-saving workflow:', workflowId)

        const response = await saveWorkflow(workflowId, safeNodes, safeEdges, viewport)
        if (response.success) {
          console.log('[Workflow Editor] Auto-saved workflow:', workflowId)

          // Check if we should update thumbnail (every 60 seconds)
          if (Date.now() - lastThumbnailTimeRef.current > 60000) {
            generateThumbnail()
          }

        } else {
          console.error('[Workflow Editor] Auto-save failed:', response.error)
        }
      } catch (error) {
        console.error('[Workflow Editor] Auto-save error:', error)
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
      imageUrl: n.data.imageUrl,
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

        const connectedData: Record<string, any> = {}

        incomingEdges.forEach((edge) => {
          const sourceNode = currentNodes.find((n) => n.id === edge.source)
          if (!sourceNode) return

          const targetHandle = edge.targetHandle

          // Map source data to target connected fields
          if (targetHandle === 'prompt') {
            if (sourceNode.type === 'textInput') {
              connectedData.connectedPrompt = sourceNode.data.text || ''
            } else if (sourceNode.data.output) {
              connectedData.connectedPrompt = sourceNode.data.output
            }
          } else if (
            targetHandle === 'image' ||
            targetHandle === 'imageOutput' ||
            targetHandle?.startsWith('image_') ||
            targetHandle?.startsWith('ref_image_')
          ) {
            const dataKey = (targetHandle === 'image' || targetHandle === 'imageOutput')
              ? 'connectedImage'
              : targetHandle?.startsWith('ref_image_')
                ? `connectedRefImage_${targetHandle.split('_')[2]}`
                : `connectedImage_${targetHandle.split('_')[1]}`

            if (sourceNode.type === 'imageUpload') {
              connectedData[dataKey] = sourceNode.data.imageUrl || ''
            } else if (sourceNode.type === 'gemini-2.5-flash-image' || sourceNode.type === 'gemini-3-pro-image-preview' || sourceNode.type === 'imagen-4.0-generate-001') {
              // Get output from model nodes
              connectedData[dataKey] = sourceNode.data.output
            } else if (sourceNode.type === 'blur' || sourceNode.type === 'colorGrading') {
              connectedData[dataKey] =
                sourceNode.data.output ||
                (typeof sourceNode.data.getOutput === 'function' ? sourceNode.data.getOutput() : null)
            } else if (sourceNode.type === 'crop') {
              connectedData[dataKey] =
                sourceNode.data.imageOutput ||
                (typeof sourceNode.data.getOutput === 'function' ? sourceNode.data.getOutput() : null)
            } else if (sourceNode.data.imageOutput) {
              connectedData[dataKey] = sourceNode.data.imageOutput
            } else if (sourceNode.data.output) {
              // Fallback for any node with output field
              connectedData[dataKey] = sourceNode.data.output
            }
          } else if (targetHandle === 'video' || targetHandle === OUTPUT_HANDLE_IDS.video) {
            connectedData.connectedVideo =
              sourceNode.data.output ||
              sourceNode.data.videoUrl ||
              sourceNode.data.assetPath ||
              ''
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

        // Only update if there are connected data changes
        if (incomingEdges.length > 0) {
          const hasChanges = Object.keys(connectedData).some(
            (key) => node.data[key] !== connectedData[key]
          )

          if (hasChanges) {
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
      return (targetInput.allowedSourceIds || []).includes(sourceHandle)
    },
    [nodes, edges, reconnectingEdgeId]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
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
    [setEdges, isAnimated]
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
    [setEdges, isAnimated]
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
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const nodeType = event.dataTransfer.getData('application/reactflow')
      if (!nodeType) {
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const model = MODELS.find(m => m.id === nodeType) || TOOLS.find(t => t.id === nodeType);
      const newNode = {
        id: `${nodeType}-${Date.now()}`,
        type: nodeType,
        position,
        data: {
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
          ...getNodeHandles(nodeType, {}),
          onUpdateNodeData: updateNodeData,
        },
      } satisfies Node<WorkflowNodeData>

      setNodes((nds) => [...nds, newNode])
    },
    [screenToFlowPosition, setNodes, updateNodeData]
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

  const addNode = useCallback((nodeType: string) => {
    const model = MODELS.find(m => m.id === nodeType) || TOOLS.find(t => t.id === nodeType);
    const newNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100
      },
      data: {
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
        ...getNodeHandles(nodeType),
        onUpdateNodeData: updateNodeData,
      },
    } satisfies Node<WorkflowNodeData>
    setNodes((nds) => [...nds, newNode])
  }, [setNodes, updateNodeData])

  const handleManualSave = useCallback(async () => {
    if (!workflowId) return

    try {
      const viewport = getViewport()
      const { nodes: safeNodes, edges: safeEdges } = getSerializableGraph(nodes, edges)

      const response = await saveWorkflow(workflowId, safeNodes, safeEdges, viewport)
      if (response.success) {
        toast.success('Workflow saved successfully')
        console.log('[Workflow Editor] Manually saved workflow:', workflowId)
      } else {
        toast.error(`Failed to save workflow: ${response.error}`)
      }
    } catch (error) {
      console.error('[Workflow Editor] Manual save error:', error)
      toast.error('An error occurred while saving')
    }
  }, [workflowId, getViewport, getSerializableGraph, nodes, edges, saveWorkflow])

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

        // Basic validation - check if it looks like a node
        if (!data.id || !data.type) return

        // Calculate position
        let newPosition = position
        if (!newPosition) {
          // Paste at center of viewport if no position provided (keyboard shortcut)
          const viewport = getViewport()
          // Center of the visible area
          // Viewport: { x, y, zoom }
          // We want center of screen, converted to flow pos
          // ReactFlow container center?
          if (reactFlowWrapper.current) {
            const { width, height } = reactFlowWrapper.current.getBoundingClientRect()
            newPosition = screenToFlowPosition({
              x: width / 2 + (window.screenX || 0), // screenToFlow takes screen coords effectively if clientX/Y used
              y: height / 2 + (window.screenY || 0)
            })
            // Actually screenToFlowPosition expects clientX/Y relative to viewport
            // If we just want center of the *Flow*, we can use checks.
            // But simpler:
            // Center x = (-viewport.x + width/2) / zoom
            // Center y = (-viewport.y + height/2) / zoom
            newPosition = {
              x: (-viewport.x + width / 2) / viewport.zoom,
              y: (-viewport.y + height / 2) / viewport.zoom
            }
          } else {
            newPosition = { x: 0, y: 0 }
          }
        }

        // Create new node with new ID
        const newNode = {
          ...data,
          id: `${data.type}-${Date.now()}`,
          position: newPosition,
          selected: true,
          data: {
            ...data.data,
            label: `${data.data.label} (Copy)`,
          },
        }

        setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNode))
        toast.success("Node pasted")
      } catch (err) {
        console.error('Paste error:', err)
        // items might not be a node
      }
    },
    [getViewport, setNodes, screenToFlowPosition]
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
        const selected = nodes.find(n => n.selected)
        if (selected) {
          e.preventDefault()
          try {
            await navigator.clipboard.writeText(JSON.stringify(selected, null, 2))
            toast.success("Node copied to clipboard")
            // console.log('Copied node:', selected.id)
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nodes, handlePaste])

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

        {/* Top Right Action Bar - Hidden when properties sidebar is open */}
        {!isRightSidebarOpen && (
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
          <PaneContextMenu onPaste={handlePaste}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              isValidConnection={isValidConnection}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onReconnectStart={onReconnectStart}
              onReconnectEnd={onReconnectEnd}
              onNodeClick={onNodeClick}
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
                  onClick={toggleAnimation}
                  title={isAnimated ? "Disable Animated Edges" : "Enable Animated Edges"}
                  className={isAnimated ? "!bg-blue-500 !border-blue-500 hover:!bg-blue-600" : ""}
                >
                  <Activity
                    className={`h-4 w-4 ${isAnimated ? 'text-white' : 'text-gray-500'}`}
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
