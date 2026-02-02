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
import { GeminiProNode } from './nodes/models/gemini-pro-node'
import { GeminiFlashNode } from './nodes/models/gemini-flash-node'
import { GeminiVisionNode } from './nodes/models/gemini-vision-node'
import { TextInputNode } from './nodes/text-input-node'
import { ImageUploadNode } from './nodes/image-upload-node'
import { ImageGenNode } from './nodes/models/image-gen-node'

const nodeTypes = {
  geminiPro: GeminiProNode,
  geminiFlash: GeminiFlashNode,
  geminiVision: GeminiVisionNode,
  textInput: TextInputNode,
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
}

type WorkflowNodeData = {
  label: string
} & NodeHandleMeta & Record<string, unknown>

const initialNodes: Node<WorkflowNodeData>[] = []
const initialEdges: Edge[] = []

type HandleKind = 'text' | 'image'

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
}

const EDGE_COLORS = {
  text: '#38bdf8', // sky-400
  image: '#34d399', // emerald-400
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
  return null
}

function getEdgeColorFromSourceHandle(sourceHandle?: string | null): string {
  const kind = getKindFromSourceHandle(sourceHandle)
  return kind ? EDGE_COLORS[kind] : EDGE_COLORS.default
}

function getNodeHandles(nodeType: string): NodeHandleMeta {
  switch (nodeType) {
    case 'geminiPro':
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
            label: 'Image',
            type: 'image',
            allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
          },
        ],
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.text,
            label: 'Result',
            type: 'text',
          },
        ],
      }
    case 'geminiFlash':
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
            id: OUTPUT_HANDLE_IDS.text,
            label: 'Result',
            type: 'text',
          },
        ],
      }
    case 'geminiVision':
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
            label: 'Image',
            type: 'image',
            required: true,
            allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
          },
        ],
        outputs: [
          {
            id: OUTPUT_HANDLE_IDS.text,
            label: 'Result',
            type: 'text',
          },
        ],
      }
    case 'imageGen':
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
          label: nodeType === 'geminiPro' ? 'Gemini 2.0 Flash' :
                 nodeType === 'geminiFlash' ? 'Gemini 2.5 Flash Lite' :
                 nodeType === 'geminiVision' ? 'Gemini Vision' :
                 nodeType === 'imageGen' ? 'Imagen 3' :
                 nodeType === 'textInput' ? 'Text Input' :
                 nodeType === 'imageUpload' ? 'Image Upload' : nodeType,
          ...(nodeType === 'geminiPro' && {
            temperature: 0.7,
            maxTokens: 1000,
            systemPrompt: '',
            userPrompt: '',
          }),
          ...(nodeType === 'geminiFlash' && {
            temperature: 0.5,
            maxTokens: 500,
            prompt: '',
          }),
          ...(nodeType === 'geminiVision' && {
            prompt: '',
            imageUrl: '',
          }),
          ...(nodeType === 'imageGen' && {
            prompt: '',
          }),
          ...(nodeType === 'textInput' && {
            text: '',
          }),
          ...(nodeType === 'imageUpload' && {
            imageUrl: '',
            fileName: '',
          }),
          ...getNodeHandles(nodeType),
        },
      } satisfies Node<WorkflowNodeData>

      setNodes((nds) => [...nds, newNode])
    },
    [screenToFlowPosition, setNodes]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedNode(node)
    setIsRightSidebarOpen(true)
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
        label: nodeType === 'geminiPro' ? 'Gemini 2.0 Flash' :
               nodeType === 'geminiFlash' ? 'Gemini 2.5 Flash Lite' :
               nodeType === 'geminiVision' ? 'Gemini Vision' :
               nodeType === 'imageGen' ? 'Imagen 3' :
               nodeType === 'textInput' ? 'Text Input' :
               nodeType === 'imageUpload' ? 'Image Upload' : nodeType,
        ...(nodeType === 'geminiPro' && {
          temperature: 0.7,
          maxTokens: 1000,
          systemPrompt: '',
          userPrompt: '',
        }),
        ...(nodeType === 'geminiFlash' && {
          temperature: 0.5,
          maxTokens: 500,
          prompt: '',
        }),
        ...(nodeType === 'geminiVision' && {
          prompt: '',
          imageUrl: '',
        }),
        ...(nodeType === 'imageGen' && {
          prompt: '',
        }),
        ...(nodeType === 'textInput' && {
          text: '',
        }),
        ...(nodeType === 'imageUpload' && {
          imageUrl: '',
          fileName: '',
        }),
        ...getNodeHandles(nodeType),
      },
    } satisfies Node<WorkflowNodeData>
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

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
  }, [setNodes])

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
