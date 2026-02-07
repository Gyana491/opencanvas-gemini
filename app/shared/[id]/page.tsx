"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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

type ShareAccess = "view" | "edit"

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

function normalizeNodes(rawNodes: unknown[]): Node[] {
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
    } as Node
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

  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [workflowName, setWorkflowName] = useState("Shared Workflow")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [isDuplicating, setIsDuplicating] = useState(false)

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
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{workflowName}</p>
          <p className="text-xs text-muted-foreground">{bannerText}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleDuplicate} disabled={isDuplicating}>
            <Copy className="mr-2 h-4 w-4" />
            {isDuplicating ? "Duplicating..." : "Duplicate to my account"}
          </Button>
        </div>
      </div>

      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={undefined}
          onEdgesChange={undefined}
          onConnect={undefined}
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
