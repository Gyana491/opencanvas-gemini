import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileJson, Package, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { Edge, Node, Viewport } from '@xyflow/react'
import { exportWorkflowAsZip } from '@/lib/utils/export-workflow'
import { Progress } from "@/components/ui/progress"
import { safeValidateWorkflow } from '@/lib/validation/workflow-schema'

type WorkflowGraphData = {
    nodes?: unknown
    edges?: unknown
    viewport?: unknown
}

interface ExportDialogProps {
    isOpen: boolean
    onClose: () => void
    workflowId: string | null
    workflowName?: string
    getWorkflowData: () => Promise<WorkflowGraphData> | WorkflowGraphData
}

function normalizeWorkflowData(data: WorkflowGraphData): {
    nodes: unknown[]
    edges: unknown[]
    viewport: Viewport
} {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : []
    const edges = Array.isArray(data?.edges) ? data.edges : []

    const rawViewport = data?.viewport as Record<string, unknown> | undefined
    const viewport: Viewport = {
        x: typeof rawViewport?.x === 'number' ? rawViewport.x : 0,
        y: typeof rawViewport?.y === 'number' ? rawViewport.y : 0,
        zoom: typeof rawViewport?.zoom === 'number' ? rawViewport.zoom : 1,
    }

    return { nodes, edges, viewport }
}

export function ExportDialog({
    isOpen,
    onClose,
    workflowId,
    workflowName = 'workflow',
    getWorkflowData,
}: ExportDialogProps) {
    const [isExporting, setIsExporting] = useState(false)
    const [exportProgress, setExportProgress] = useState(0)
    const [exportMessage, setExportMessage] = useState('')

    const handleExportJson = async () => {
        try {
            const workflowData = await getWorkflowData()
            const normalized = normalizeWorkflowData(workflowData)
            const validation = safeValidateWorkflow({
                id: workflowId ?? undefined,
                name: workflowName,
                ...normalized,
            })

            if (!validation.success) {
                console.error('Validation errors:', validation.details)
                toast.error('Invalid workflow data')
                return
            }

            const data = {
                id: workflowId,
                name: workflowName,
                nodes: validation.data.nodes,
                edges: validation.data.edges,
                viewport: validation.data.viewport,
                exportedAt: new Date().toISOString(),
            }

            downloadJson(data, `opencanvas_workflow_${workflowId || 'unknown'}.json`)
            toast.success('Workflow JSON exported successfully')
            onClose()
        } catch (error) {
            console.error('Failed to export JSON:', error)
            toast.error('Failed to export workflow JSON')
        }
    }

    const handleExportZip = async () => {
        if (!workflowId) {
            toast.error('Workflow ID is required')
            return
        }

        setIsExporting(true)
        setExportProgress(0)
        setExportMessage('Starting export...')

        try {
            const workflowData = await getWorkflowData()
            const normalized = normalizeWorkflowData(workflowData)
            const validation = safeValidateWorkflow({
                id: workflowId ?? undefined,
                name: workflowName,
                ...normalized,
            })
            if (!validation.success) {
                console.error('Validation errors:', validation.details)
                toast.error('Invalid workflow data')
                setIsExporting(false)
                return
            }

            const { nodes, edges, viewport } = validation.data

            await exportWorkflowAsZip(
                workflowId,
                workflowName,
                nodes as unknown as Node[],
                edges as unknown as Edge[],
                viewport as Viewport,
                (progress, message) => {
                    setExportProgress(progress)
                    setExportMessage(message)
                }
            )

            toast.success('Workflow exported successfully with all assets!')
            
            // Reset and close after a brief delay
            setTimeout(() => {
                setIsExporting(false)
                setExportProgress(0)
                setExportMessage('')
                onClose()
            }, 1000)
        } catch (error) {
            console.error('Failed to export ZIP:', error)
            toast.error('Failed to export workflow')
            setIsExporting(false)
            setExportProgress(0)
            setExportMessage('')
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isExporting && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Export Workflow</DialogTitle>
                    <DialogDescription>
                        Choose how you want to export your workflow.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 py-4">
                    <Card
                        className={`cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-primary/50 ${
                            isExporting ? 'opacity-50 pointer-events-none' : ''
                        }`}
                        onClick={handleExportZip}
                    >
                        <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                {isExporting ? (
                                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                ) : (
                                    <Package className="h-6 w-6 text-primary" />
                                )}
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-base">Export with Assets (ZIP)</CardTitle>
                                <CardDescription>
                                    Bundle workflow JSON with all media files
                                </CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card
                        className={`cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-primary/50 ${
                            isExporting ? 'opacity-50 pointer-events-none' : ''
                        }`}
                        onClick={handleExportJson}
                    >
                        <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                <FileJson className="h-6 w-6 text-foreground" />
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-base">Workflow Only (JSON)</CardTitle>
                                <CardDescription>
                                    Download the JSON structure only.
                                </CardDescription>
                            </div>
                        </CardHeader>
                    </Card>
                </div>

                {isExporting && (
                    <div className="space-y-2 pb-4">
                        <Progress value={exportProgress} className="h-2" />
                        <p className="text-sm text-muted-foreground text-center">{exportMessage}</p>
                    </div>
                )}

                <DialogFooter className="sm:justify-end">
                    <Button variant="secondary" onClick={onClose} disabled={isExporting}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
