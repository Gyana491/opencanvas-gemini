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
import { Activity, Download, Share2 } from 'lucide-react'
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

const NODES_WITH_PROPERTIES = [
  'imagen',
  'nanoBanana',
  'nanoBananaPro',
  'veo3',
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

const OUTPUT_HANDLE_IDS = {
  text: 'textOutput',
  image: 'imageOutput',
  video: 'videoOutput',
}

const EDGE_COLORS = {
  text: '#38bdf8', // sky-400
  image: '#34d399', // emerald-400
  video: '#a78bfa', // violet-400
  default: '#94a3b8', // slate-400
} as const

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

function getNodeHandles(nodeType: string | undefined, data?: any): NodeHandleMeta {
  if (!nodeType) return { inputs: [], outputs: [] }

  switch (nodeType) {
    case 'imagen':
      return {
        inputs: [
          {
            id: 'prompt',
            label: 'Prompt',
            type: 'text',
            required: true,
            allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
          },
        ],
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.image,
            label: 'Image',
            type: 'image',
          },
        ],
      }
    case 'textInput':
      return {
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.text,
            label: 'Text',
            type: 'text',
          },
        ],
      }
    case 'imageUpload':
      return {
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.image,
            label: 'Image',
            type: 'image',
          },
        ],
      }
    case 'nanoBanana':
    case 'nanoBananaPro':
      const imageCount = (data?.imageInputCount as number) || 1;
      return {
        inputs: [
          {
            id: 'prompt',
            label: 'Prompt',
            type: 'text',
            required: true,
            allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
          },
          ...Array.from({ length: imageCount }).map((_, i) => ({
            id: `image_${i}`,
            label: `Ref Image ${i + 1}`,
            type: 'image' as const,
            allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
          })),
        ],
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.image,
            label: 'Image',
            type: 'image',
          },
        ],
      }
    case 'veo3':
      const refImageCount = (data?.imageInputCount as number) || 0;
      return {
        inputs: [
          {
            id: 'prompt',
            label: 'Prompt',
            type: 'text',
            required: true,
            allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
          },
          {
            id: 'image',
            label: 'First Frame',
            type: 'image',
            allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
          },
          ...Array.from({ length: refImageCount }).map((_, i) => ({
            id: `ref_image_${i}`,
            label: `Ref ${i + 1}`,
            type: 'image' as const,
            allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
          })),
          {
            id: 'video',
            label: 'Extend Video',
            type: 'video',
            allowedSourceIds: [OUTPUT_HANDLE_IDS.video],
          },
        ],
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.video,
            label: 'Video',
            type: 'video',
            allowedSourceIds: [OUTPUT_HANDLE_IDS.video],
          },
        ],
      }
    default:
      return {}
  }
}

function WorkflowEditorInner() {
  const params = useParams()
  const router = useRouter()
  const workflowId = params.id as string

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [connectingSourceHandle, setConnectingSourceHandle] = useState<string | null>(null)
  const [isAnimated, setIsAnimated] = useState(true)
  const { screenToFlowPosition, setViewport, getViewport, getNodes, getEdges } = useReactFlow()
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [newName, setNewName] = useState("")
  const [workflowName, setWorkflowName] = useState("")

  const { createWorkflow, loadWorkflow, saveWorkflow, renameWorkflow, deleteWorkflow, duplicateWorkflow, isLoading } = useWorkflow()

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const AUTO_SAVE_DELAY = 2000 // 2 seconds

  // Track if workflow creation is in progress to prevent duplicates
  const creationInProgressRef = useRef(false)

  // Load workflow on mount
  useEffect(() => {
    async function loadWorkflowData() {
      if (!workflowId) return

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
            setNodes((loadedNodes || []) as Node<WorkflowNodeData>[])
            setEdges(loadedEdges || [])
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
      }
    }

    loadWorkflowData()
  }, [workflowId, router, createWorkflow, loadWorkflow, setEdges, setNodes, setViewport])


  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const lastThumbnailTimeRef = useRef<number>(0)

  // Helper to sanitize nodes for saving (remove functions)
  const getSerializableGraph = useCallback((nodes: Node[], edges: Edge[]) => {
    const serializableNodes = nodes.map(node => {
      const { data, ...rest } = node
      // Create a clean data object without functions
      const cleanData = Object.entries(data).reduce((acc, [key, value]) => {
        if (typeof value !== 'function') {
          acc[key] = value
        }
        return acc
      }, {} as Record<string, any>)

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

      const dataUrl = await toPng(reactFlowWrapper.current, {
        backgroundColor: '#fff',
        width: 1280,
        height: 720,
        cacheBust: true,
        pixelRatio: 1,
        skipAutoScale: true,
        includeQueryParams: true,
        filter: (node: HTMLElement) => {
          // Exclude controls, minimap, and panels
          if (node.classList) {
            const excludeClasses = [
              'react-flow__controls',
              'react-flow__minimap', 
              'react-flow__panel',
              'react-flow__attribution'
            ]
            if (excludeClasses.some(cls => node.classList.contains(cls))) {
              return false
            }
          }
          return true
        }
      })

      // Convert dataUrl to blob
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], "thumbnail.png", { type: "image/png" })

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
  React.useEffect(() => {
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
          } else if (targetHandle === 'image' || targetHandle?.startsWith('image_')) {
            const dataKey = targetHandle === 'image' ? 'connectedImage' : `connectedImage_${targetHandle.split('_')[1]}`

            if (sourceNode.type === 'imageUpload') {
              connectedData[dataKey] = sourceNode.data.imageUrl || ''
            } else if (sourceNode.type === 'nanoBanana' || sourceNode.type === 'nanoBananaPro' || sourceNode.type === 'imagen') {
              // Get output from model nodes
              connectedData[dataKey] = sourceNode.data.output
            } else if (sourceNode.data.imageOutput) {
              connectedData[dataKey] = sourceNode.data.imageOutput
            }
          }
        })

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
  }, [edges, updateNodeData, setNodes])

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (edgeOrConnection) => {
      const target = edgeOrConnection.target
      const targetHandle = edgeOrConnection.targetHandle
      const sourceHandle = edgeOrConnection.sourceHandle

      if (!target || !targetHandle || typeof sourceHandle !== 'string') {
        return false
      }

      // Prevent multiple connections to the same target handle
      const existingConnection = edges.find(
        (edge) => edge.target === target && edge.targetHandle === targetHandle
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
    [nodes, edges]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const stroke = getEdgeColorFromSourceHandle(connection.sourceHandle)
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: isAnimated,
            style: { stroke, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
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

      const newNode = {
        id: `${nodeType}-${Date.now()}`,
        type: nodeType,
        position,
        data: {
          label: nodeType === 'imagen' ? 'Imagen 4.0' :
            nodeType === 'nanoBanana' ? 'Nano Banana' :
              nodeType === 'nanoBananaPro' ? 'Nano Banana Pro' :
                nodeType === 'veo3' ? 'Veo 3' :
                  nodeType === 'textInput' ? 'Text Input' :
                    nodeType === 'imageUpload' ? 'Image Upload' : nodeType,
          ...(nodeType === 'imagen' && {
            prompt: '',
          }),
          ...(nodeType === 'textInput' && {
            text: '',
          }),
          ...(nodeType === 'imageUpload' && {
            imageUrl: '',
            fileName: '',
          }),
          ...(nodeType === 'nanoBanana' && {
            prompt: '',
            aspectRatio: '1:1',
          }),
          ...(nodeType === 'nanoBananaPro' && {
            prompt: '',
            imageSize: '1K',
            useGoogleSearch: false,
          }),
          ...(nodeType === 'veo3' && {
            prompt: '',
            resolution: '720p',
            durationSeconds: '8',
            aspectRatio: '16:9',
            imageInputCount: 0,
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
    const newNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100
      },
      data: {
        label: nodeType === 'imagen' ? 'Imagen 4.0' :
          nodeType === 'nanoBanana' ? 'Nano Banana' :
            nodeType === 'nanoBananaPro' ? 'Nano Banana Pro' :
              nodeType === 'veo3' ? 'Veo 3' :
                nodeType === 'textInput' ? 'Text Input' :
                  nodeType === 'imageUpload' ? 'Image Upload' : nodeType,
        ...(nodeType === 'imagen' && {
          prompt: '',
        }),
        ...(nodeType === 'textInput' && {
          text: '',
        }),
        ...(nodeType === 'imageUpload' && {
          imageUrl: '',
          fileName: '',
        }),
        ...(nodeType === 'nanoBanana' && {
          prompt: '',
          aspectRatio: '1:1',
        }),
        ...(nodeType === 'nanoBananaPro' && {
          prompt: '',
          imageSize: '1K',
          useGoogleSearch: false,
        }),
        ...(nodeType === 'veo3' && {
          prompt: '',
          resolution: '720p',
          durationSeconds: '8',
          aspectRatio: '16:9',
          imageInputCount: 0,
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

  return (
    <div className="flex h-screen w-full bg-background">
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
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={workflowNodeTypes}
            connectionLineStyle={{
              stroke: getEdgeColorFromSourceHandle(connectingSourceHandle),
              strokeWidth: 2,
            }}
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
