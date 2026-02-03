"use client"

import React, { useCallback, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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

import { EditorSidebar } from './editor-sidebar'
import { NodeLibrary } from './node-library'
import { NodeProperties } from './node-properties'
import { ImagenNode } from './nodes/models/imagen-node'
import { TextInputNode } from './nodes/text-input-node'
import { ImageUploadNode } from './nodes/image-upload-node'
import { NanoBananaNode } from './nodes/models/nano-banana-node'
import { NanoBananaProNode } from './nodes/models/nano-banana-pro-node'
import { Veo3Node } from './nodes/models/veo-3-node'

const nodeTypes = {
  imagen: ImagenNode,
  textInput: TextInputNode,
  imageUpload: ImageUploadNode,
  nanoBanana: NanoBananaNode,
  nanoBananaPro: NanoBananaProNode,
  veo3: Veo3Node,
}

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

function getNodeHandles(nodeType: string): NodeHandleMeta {
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
    case 'veo3':
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
            id: OUTPUT_HANDLE_IDS.video,
            label: 'Video',
            type: 'video',
          },
        ],
      }
    default:
      return {}
  }
}

function WorkflowEditorInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [connectingSourceHandle, setConnectingSourceHandle] = useState<string | null>(null)
  const { screenToFlowPosition } = useReactFlow()

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
            // Text output from source node
            if (sourceNode.type === 'textInput') {
              connectedData.connectedPrompt = sourceNode.data.text || ''
            } else if (sourceNode.data.output) {
              connectedData.connectedPrompt = sourceNode.data.output
            }
          } else if (targetHandle === 'image') {
            // Image output from source node
            if (sourceNode.type === 'imageUpload') {
              connectedData.connectedImage = sourceNode.data.imageUrl || ''
            } else if (sourceNode.data.imageOutput) {
              connectedData.connectedImage = sourceNode.data.imageOutput
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

      const targetNode = nodes.find((node) => node.id === target)
      const rawInputs = (targetNode?.data as WorkflowNodeData | undefined)?.inputs
      const inputs: HandleMeta[] = Array.isArray(rawInputs) ? rawInputs : []
      const targetInput = inputs.find((input) => input.id === targetHandle)
      if (!targetInput) {
        return false
      }
      return (targetInput.allowedSourceIds || []).includes(sourceHandle)
    },
    [nodes]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const stroke = getEdgeColorFromSourceHandle(connection.sourceHandle)
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            style: { stroke, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          },
          eds
        )
      )
    },
    [setEdges]
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
            durationSeconds: 4,
          }),
          ...getNodeHandles(nodeType),
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
          durationSeconds: 4,
        }),
        ...getNodeHandles(nodeType),
        onUpdateNodeData: updateNodeData,
      },
    } satisfies Node<WorkflowNodeData>
    setNodes((nds) => [...nds, newNode])
  }, [setNodes, updateNodeData])

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Minimal left sidebar with logo, search, layers - always visible */}
      <EditorSidebar
        onSearchClick={() => setIsLibraryOpen(true)}
        onLayersClick={() => setIsLibraryOpen(!isLibraryOpen)}
        isLibraryOpen={isLibraryOpen}
      />

      {/* Full width canvas area */}
      <div className="flex-1 relative">
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
          nodeTypes={nodeTypes}
          connectionLineStyle={{
            stroke: getEdgeColorFromSourceHandle(connectingSourceHandle),
            strokeWidth: 2,
          }}
          fitView
          className="bg-background"
        >
          <Background />
          <Controls position="bottom-center" />
        </ReactFlow>

        {/* Node Library - slides from left, positioned after icon bar */}
        <NodeLibrary
          onAddNode={addNode}
          onClose={() => setIsLibraryOpen(false)}
          isOpen={isLibraryOpen}
        />

        {/* Right sidebar for node properties */}
        <NodeProperties
          node={selectedNode}
          onUpdateNode={updateNodeData}
          isOpen={isRightSidebarOpen}
          onClose={() => {
            setIsRightSidebarOpen(false)
            setSelectedNode(null)
          }}
        />
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
