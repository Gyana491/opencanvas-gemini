import React from 'react'
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
import { FileJson, Package } from "lucide-react"
import { toast } from "sonner"
import { useReactFlow } from '@xyflow/react'

interface ExportDialogProps {
    isOpen: boolean
    onClose: () => void
    workflowId: string | null
    workflowName?: string
}

export function ExportDialog({ isOpen, onClose, workflowId, workflowName = 'workflow' }: ExportDialogProps) {
    const { getNodes, getEdges, getViewport } = useReactFlow()

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
        toast.info("ZIP export coming soon with R2 integration!")
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
                        className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-primary/50 opacity-50"
                        onClick={handleExportZip}
                    >
                        <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                <Package className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex-1">
                                <CardTitle className="text-base">Export with Assets (ZIP)</CardTitle>
                                <CardDescription>
                                    Coming soon!
                                </CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card
                        className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-primary/50"
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

                <DialogFooter className="sm:justify-end">
                    <Button variant="secondary" onClick={onClose}>
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
