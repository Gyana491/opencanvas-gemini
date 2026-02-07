import React, { useRef, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileArchive, FileJson, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from 'next/navigation'
import { useWorkflow } from './hooks/use-workflow'

interface ImportDialogProps {
    isOpen: boolean
    onClose: () => void
}

export function ImportDialog({ isOpen, onClose }: ImportDialogProps) {
    const router = useRouter()
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { createWorkflow, saveWorkflow } = useWorkflow()

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                const text = await file.text()
                const data = JSON.parse(text)

                // Basic validation
                if (!data.nodes || !data.edges) {
                    throw new Error('Invalid workflow JSON')
                }

                // Create new workflow
                const result = await createWorkflow(data.name || 'Imported Workflow')
                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Failed to create workflow')
                }

                const newId = result.data.id

                // Save content
                await saveWorkflow(newId, data.nodes, data.edges, data.viewport || { x: 0, y: 0, zoom: 1 })

                toast.success('Workflow imported successfully')
                router.push(`/editor/${newId}`)
                onClose()
            } else {
                toast.error("Only JSON import is supported for now.")
            }
        } catch (error) {
            console.error('Import error:', error)
            toast.error('Failed to import workflow')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import Workflow</DialogTitle>
                    <DialogDescription>
                        Upload a .json workflow file.
                    </DialogDescription>
                </DialogHeader>

                <div
                    className={`
            border-2 border-dashed rounded-lg p-8 
            flex flex-col items-center justify-center text-center 
            transition-colors
            ${isUploading ? 'bg-muted opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer border-muted-foreground/25 hover:border-primary/50'}
          `}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                    {isUploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Importing...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-4 mb-4">
                                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <FileJson className="h-6 w-6 text-primary" />
                                </div>
                                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center opacity-50">
                                    <FileArchive className="h-6 w-6 text-muted-foreground" />
                                </div>
                            </div>
                            <h3 className="text-sm font-semibold mb-1">Click to upload JSON</h3>
                            <p className="text-xs text-muted-foreground max-w-[200px]">
                                ZIP import coming soon
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
