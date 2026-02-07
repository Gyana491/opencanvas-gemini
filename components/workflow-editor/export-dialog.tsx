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
import { useReactFlow } from '@xyflow/react'
import { exportWorkflowAsZip } from '@/lib/utils/export-workflow'
import { Progress } from "@/components/ui/progress"

interface ExportDialogProps {
    isOpen: boolean
    onClose: () => void
    workflowId: string | null
    workflowName?: string
}

export function ExportDialog({ isOpen, onClose, workflowId, workflowName = 'workflow' }: ExportDialogProps) {
    const { getNodes, getEdges, getViewport } = useReactFlow()
    const [isExporting, setIsExporting] = useState(false)
    const [exportProgress, setExportProgress] = useState(0)
    const [exportMessage, setExportMessage] = useState('')

    const handleExportJson = async () => {
        try {
            const rawNodes = getNodes()
            const edges = getEdges()
            const viewport = getViewport()

            // Sanitize nodes to remove asset URLs (opencanvas:// references if any remain, though R2 urls are fine)
            // Ideally we keep R2 URLs as they are public URLs.
            // But if we want to be safe, we can strip sensitive data.
            // For now, let's keep it simple and just export the data structure.

            const data = {
                id: workflowId,
                name: workflowName,
                nodes: rawNodes,
                edges,
                viewport,
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
            const nodes = getNodes()
            const edges = getEdges()
            const viewport = getViewport()

            await exportWorkflowAsZip(
                workflowId,
                workflowName,
                nodes,
                edges,
                viewport,
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
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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

function downloadJson(data: any, filename: string) {
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
