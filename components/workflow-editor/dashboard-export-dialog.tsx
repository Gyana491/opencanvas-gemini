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
import { Progress } from "@/components/ui/progress"
import { exportWorkflowAsZip } from '@/lib/utils/export-workflow'
import { safeValidateWorkflow } from '@/lib/validation/workflow-schema'

interface DashboardExportDialogProps {
    isOpen: boolean
    onClose: () => void
    workflowId: string
    workflowName: string
}

export function DashboardExportDialog({ 
    isOpen, 
    onClose, 
    workflowId, 
    workflowName 
}: DashboardExportDialogProps) {
    const [isExporting, setIsExporting] = useState(false)
    const [exportProgress, setExportProgress] = useState(0)
    const [exportMessage, setExportMessage] = useState('')

    const fetchWorkflowData = async () => {
        try {
            const res = await fetch(`/api/workflows/${workflowId}`)
            if (!res.ok) {
                throw new Error('Failed to fetch workflow')
            }
            const workflow = await res.json()
            return workflow.data
        } catch (error) {
            console.error('Failed to fetch workflow:', error)
            throw error
        }
    }

    const handleExportJson = async () => {
        try {
            const workflowData = await fetchWorkflowData()
            
            if (!workflowData) {
                toast.error('No workflow data found')
                return
            }

            const data = {
                id: workflowId,
                name: workflowName,
                ...workflowData,
                exportedAt: new Date().toISOString(),
            }

            downloadJson(data, `opencanvas_workflow_${workflowId}.json`)
            toast.success('Workflow JSON exported successfully')
            onClose()
        } catch (error) {
            console.error('Failed to export JSON:', error)
            toast.error('Failed to export workflow JSON')
        }
    }

    const handleExportZip = async () => {
        setIsExporting(true)
        setExportProgress(0)
        setExportMessage('Starting export...')

        try {
            setExportProgress(10)
            setExportMessage('Fetching workflow data...')
            
            const workflowData = await fetchWorkflowData()
            
            if (!workflowData) {
                toast.error('No workflow data found')
                setIsExporting(false)
                return
            }

            // Validate workflow data
            const validation = safeValidateWorkflow(workflowData)
            if (!validation.success) {
                console.error('Validation errors:', validation.details)
                toast.error('Invalid workflow data')
                setIsExporting(false)
                return
            }

            const { nodes = [], edges = [], viewport = { x: 0, y: 0, zoom: 1 } } = validation.data

            setExportProgress(20)
            setExportMessage('Exporting workflow...')

            await exportWorkflowAsZip(
                workflowId,
                workflowName,
                nodes as any,
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
