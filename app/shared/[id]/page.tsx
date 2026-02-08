"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/auth-client"
import { workflowNodeTypes } from "@/components/workflow-editor/node-types"
import { OUTPUT_HANDLE_IDS, TOOL_OUTPUT_HANDLE_IDS } from "@/data/models"

type ShareAccess = "view" | "edit"
type WorkflowNodeData = Record<string, unknown>

type SharedResponse = {
  id: string
  name: string
  access: ShareAccess
  data: {
    nodes: unknown[]
    edges: unknown[]
    viewport: {
      x: number
      y: number
      zoom: number
    }
  }
}

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getNodeData(node: Node<WorkflowNodeData>): WorkflowNodeData {
  return ensureObject(node.data) as WorkflowNodeData
}

function normalizeNodes(rawNodes: unknown[]): Node<WorkflowNodeData>[] {
  return rawNodes.map((item, index) => {
    const node = ensureObject(item)
    const position = ensureObject(node.position)
    const data = ensureObject(node.data)

    return {
      ...node,
      id: typeof node.id === "string" ? node.id : `node-${index + 1}`,
      position: {
        x: typeof position.x === "number" ? position.x : index * 40,
        y: typeof position.y === "number" ? position.y : index * 40,
      },
      data:
        Object.keys(data).length > 0
          ? data
          : { label: typeof node.type === "string" ? node.type : `Node ${index + 1}` },
    } as Node<WorkflowNodeData>
  })
}

function normalizeEdges(rawEdges: unknown[]): Edge[] {
  return rawEdges
    .map((item, index) => {
      const edge = ensureObject(item)
      if (typeof edge.source !== "string" || typeof edge.target !== "string") {
        return null
      }
      return {
        ...edge,
        id: typeof edge.id === "string" ? edge.id : `edge-${index + 1}`,
        source: edge.source,
        target: edge.target,
      } as Edge
    })
    .filter((edge): edge is Edge => Boolean(edge))
}

function SharedWorkflowInner() {
  const router = useRouter()
  const params = useParams()
  const { data: session } = useSession()
  const { setViewport } = useReactFlow()

  const workflowId = params.id as string

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [workflowName, setWorkflowName] = useState("Shared Workflow")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [isDuplicating, setIsDuplicating] = useState(false)
  const graphSignatureRef = useRef("")

  const edgeSignature = useMemo(() => {
    return JSON.stringify(
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      }))
    )
  }, [edges])

  const nodeOutputs = useMemo(() => {
    return JSON.stringify(
      nodes.map((node) => {
        const data = getNodeData(node)
        return {
          id: node.id,
          output: data.output ?? null,
          imageOutput: data.imageOutput ?? null,
          maskOutput: data.maskOutput ?? null,
          videoOutput: data.videoOutput ?? null,
          imageUrl: data.imageUrl ?? null,
          videoUrl: data.videoUrl ?? null,
          assetPath: data.assetPath ?? null,
          text: data.text ?? null,
          blurType: data.blurType ?? null,
          blurSize: data.blurSize ?? null,
        }
      })
    )
  }, [nodes])

  const graphSignature = useMemo(
    () => `${edgeSignature}::${nodeOutputs}`,
    [edgeSignature, nodeOutputs]
  )

  useEffect(() => {
    if (graphSignatureRef.current === graphSignature) {
      return
    }
    graphSignatureRef.current = graphSignature

    setNodes((currentNodes) => {
      return currentNodes.map((node) => {
        const nodeData = getNodeData(node)
        const incomingEdges = edges.filter((edge) => edge.target === node.id)
        const isVeoNode = node.type === "veo-3.1-generate-preview"
        const connectedData: Record<string, unknown> = {}

        if (isVeoNode) {
          connectedData.connectedPrompt = ""
          connectedData.connectedFirstFrame = ""
          connectedData.connectedLastFrame = ""
          connectedData.connectedVideo = ""
          const refImageCount = Number(nodeData.imageInputCount) || 0
          for (let i = 0; i < refImageCount; i += 1) {
            connectedData[`connectedRefImage_${i}`] = ""
          }
        }

        const resolveSourceImageValue = (sourceNode: Node<WorkflowNodeData>, sourceHandle?: string | null) => {
          const sourceData = getNodeData(sourceNode)

          if (sourceNode.type === "imageUpload") {
            return String(sourceData.imageUrl || sourceData.assetPath || "")
          }
          if (
            sourceNode.type === "gemini-2.5-flash-image" ||
            sourceNode.type === "gemini-3-pro-image-preview" ||
            sourceNode.type === "imagen-4.0-generate-001"
          ) {
            return String(sourceData.output || "")
          }
          if (sourceNode.type === "blur" || sourceNode.type === "colorGrading") {
            return String(sourceData.output || "")
          }
          if (sourceNode.type === "crop") {
            return String(sourceData.imageOutput || "")
          }
          if (sourceNode.type === "painter") {
            if (sourceHandle === TOOL_OUTPUT_HANDLE_IDS.painterMask) {
              return String(sourceData.maskOutput || "")
            }
            return String(sourceData.output || sourceData.imageOutput || "")
          }

          return String(
            sourceData.imageOutput ||
            sourceData.output ||
            sourceData.imageUrl ||
            sourceData.assetPath ||
            ""
          )
        }

        incomingEdges.forEach((edge) => {
          const sourceNode = currentNodes.find((n) => n.id === edge.source)
          if (!sourceNode) return

          const sourceData = getNodeData(sourceNode)
          const targetHandle = edge.targetHandle
          const sourceHandle = edge.sourceHandle

          if (targetHandle === "prompt") {
            if (sourceNode.type === "textInput") {
              connectedData.connectedPrompt = String(sourceData.text || "")
            } else if (sourceData.output) {
              connectedData.connectedPrompt = String(sourceData.output)
            }
            return
          }

          if (
            targetHandle === "image" ||
            targetHandle === "firstFrame" ||
            targetHandle === "lastFrame" ||
            targetHandle === "imageOutput" ||
            targetHandle?.startsWith("image_") ||
            targetHandle?.startsWith("ref_image_")
          ) {
            const sourceImageValue = resolveSourceImageValue(sourceNode, sourceHandle)
            let dataKey: string

            if ((targetHandle === "image" || targetHandle === "firstFrame") && isVeoNode) {
              dataKey = "connectedFirstFrame"
            } else if (targetHandle === "lastFrame" && isVeoNode) {
              dataKey = "connectedLastFrame"
            } else if (targetHandle === "image" || targetHandle === "imageOutput") {
              dataKey = "connectedImage"
            } else if (targetHandle?.startsWith("ref_image_")) {
              dataKey = `connectedRefImage_${targetHandle.split("_")[2]}`
            } else {
              dataKey = `connectedImage_${targetHandle?.split("_")[1]}`
            }

            connectedData[dataKey] = sourceImageValue || ""
            return
          }

          if (targetHandle === "video" || targetHandle === OUTPUT_HANDLE_IDS.video) {
            connectedData.connectedVideo = String(
              sourceData.output ||
              sourceData.videoUrl ||
              sourceData.assetPath ||
              ""
            )
          }
        })

        const hasImageEdge = incomingEdges.some((edge) => {
          return edge.targetHandle === "image" || edge.targetHandle === "imageOutput"
        })

        if ((node.type === "blur" || node.type === "colorGrading") && !hasImageEdge) {
          if (nodeData.connectedImage) {
            return {
              ...node,
              data: {
                ...nodeData,
                connectedImage: "",
                output: null,
                imageOutput: null,
                getOutput: null,
              },
            }
          }
        }

        if (node.type === "crop" && !hasImageEdge) {
          if (nodeData.connectedImage) {
            return {
              ...node,
              data: {
                ...nodeData,
                connectedImage: "",
                output: null,
                imageOutput: null,
                getOutput: null,
                cropRect: null,
              },
            }
          }
        }

        if (node.type === "painter" && !hasImageEdge) {
          if (nodeData.connectedImage) {
            return {
              ...node,
              data: {
                ...nodeData,
                connectedImage: "",
                output: null,
                imageOutput: null,
                maskOutput: null,
                getOutput: null,
                getMaskOutput: null,
              },
            }
          }
        }

        if (incomingEdges.length > 0 || isVeoNode) {
          const hasChanges = Object.keys(connectedData).some((key) => {
            return nodeData[key] !== connectedData[key]
          })

          if (hasChanges) {
            return {
              ...node,
              data: {
                ...nodeData,
                ...connectedData,
              },
            }
          }
        }

        return node
      })
    })
  }, [edges, graphSignature, setNodes])

  useEffect(() => {
    let cancelled = false

    const loadWorkflow = async () => {
      try {
        setIsLoading(true)
        setError("")

        const res = await fetch(`/api/shared/${workflowId}`)
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.error || "Failed to load shared workflow")
        }

        const payload = (await res.json()) as SharedResponse
        if (cancelled) return

        setWorkflowName(payload.name)
        setNodes(normalizeNodes(payload.data.nodes))
        setEdges(normalizeEdges(payload.data.edges))
        setViewport(payload.data.viewport, { duration: 0 })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load workflow")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadWorkflow()
    return () => {
      cancelled = true
    }
  }, [workflowId, setNodes, setEdges, setViewport])

  const handleDuplicate = async () => {
    if (!session) {
      const backTo = `/shared/${workflowId}`
      router.push(`/login?from=${encodeURIComponent(backTo)}`)
      return
    }

    try {
      setIsDuplicating(true)
      const res = await fetch(`/api/shared/${workflowId}/duplicate`, {
        method: "POST",
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || "Failed to duplicate workflow")
      }
      const payload = await res.json()
      toast.success("Workflow duplicated to your account")
      router.push(`/dashboard/editor/${payload.workflowId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate workflow")
    } finally {
      setIsDuplicating(false)
    }
  }

  const bannerText = useMemo(
    () => "Read-only access: you can zoom, browse, and duplicate this workflow.",
    []
  )

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading shared workflow...</div>
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-md border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-col gap-3 border-b px-3 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Image
                src="/logo.png"
                alt="OpenCanvas Logo"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">OpenCanvas</span>
            </div>
          </Link>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workflowName}</p>
            <p className="text-xs text-muted-foreground sm:truncate">{bannerText}</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button onClick={handleDuplicate} disabled={isDuplicating} className="w-full sm:w-auto">
            <Copy className="mr-2 h-4 w-4" />
            {isDuplicating ? "Duplicating..." : "Duplicate to my account"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={undefined}
          minZoom={0.05}
          maxZoom={10}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodeTypes={workflowNodeTypes}
          className="bg-background shared-readonly"
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls position="bottom-center" />
        </ReactFlow>
      </div>
      <style jsx global>{`
        .shared-readonly .react-flow__node {
          pointer-events: none;
        }

        /* Keep shared view read-only, but allow video playback controls. */
        .shared-readonly .react-flow__node video {
          pointer-events: auto;
        }
      `}</style>
    </div>
  )
}

export default function SharedWorkflowPage() {
  return (
    <ReactFlowProvider>
      <SharedWorkflowInner />
    </ReactFlowProvider>
  )
}
