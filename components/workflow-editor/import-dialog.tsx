import React, { useRef, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileJson, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from 'next/navigation'
import { useWorkflow } from './hooks/use-workflow'
import { importWorkflowFromJson } from '@/lib/utils/import-workflow'

interface ImportDialogProps {
    isOpen: boolean
    onClose: () => void
}

export function ImportDialog({ isOpen, onClose }: ImportDialogProps) {
    const router = useRouter()
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { createWorkflow, saveWorkflow } = useWorkflow()

    const processFile = async (file: File) => {
        // Validate file type
        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            toast.error('Please upload a valid JSON file')
            return
        }

        setIsUploading(true)

        try {
            // Import the workflow data from JSON
            const workflowData = await importWorkflowFromJson(file)

            // Create new workflow with imported name
            const result = await createWorkflow(workflowData.name || 'Imported Workflow')
            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to create workflow')
            }

            const newWorkflowId = result.data.id

            // Save the imported workflow content
            await saveWorkflow(
                newWorkflowId,
                workflowData.nodes,
                workflowData.edges,
                workflowData.viewport || { x: 0, y: 0, zoom: 1 }
            )

            toast.success(`Workflow "${workflowData.name}" imported successfully`)
            
            // Navigate to the new workflow
            router.push(`/dashboard/editor/${newWorkflowId}`)
            onClose()
        } catch (error) {
            console.error('Import error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to import workflow')
        } finally {
            setIsUploading(false)
        }
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            await processFile(file)
        }
        // Reset input value so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!isUploading) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        // Only set dragging to false if leaving the drop zone itself
        if (e.currentTarget === e.target) {
            setIsDragging(false)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (isUploading) return

        const files = Array.from(e.dataTransfer.files)
        if (files.length === 0) return

        if (files.length > 1) {
            toast.error('Please drop only one file at a time')
            return
        }

        await processFile(files[0])
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import Workflow</DialogTitle>
                    <DialogDescription>
                        Drag and drop a JSON file or click to browse
                    </DialogDescription>
                </DialogHeader>

                <div
                    className={`
            border-2 border-dashed rounded-lg p-8 
            flex flex-col items-center justify-center text-center 
            transition-all duration-200
            ${isUploading 
                ? 'bg-muted opacity-50 cursor-not-allowed' 
                : isDragging 
                    ? 'bg-primary/5 border-primary scale-[1.02]' 
                    : 'hover:bg-muted/50 cursor-pointer border-muted-foreground/25 hover:border-primary/50'
            }
          `}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {isUploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Importing workflow...</p>
                        </div>
                    ) : isDragging ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                                <Upload className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-sm font-semibold text-primary">Drop JSON file here</h3>
                            <p className="text-xs text-muted-foreground max-w-[200px]">
                                Release to upload your workflow
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                                <FileJson className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-sm font-semibold mb-1">Drag & drop or click to upload</h3>
                            <p className="text-xs text-muted-foreground max-w-[220px]">
                                Upload a workflow JSON file to import
                            </p>
                        </>
                    )}

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".json,application/json"
                        onChange={handleFileChange}
                        disabled={isUploading}
                    />
                </div>

                <div className="flex justify-end">
                    <Button variant="ghost" onClick={onClose} disabled={isUploading}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
