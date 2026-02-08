"use client"

import { useCallback } from "react"
import { useReactFlow, Node } from "@xyflow/react"
import { Copy, Trash2, Files, Download } from "lucide-react"
import { toast } from "sonner"
import { downloadMedia } from "@/lib/utils/download"

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NodeContextMenuProps {
    children?: React.ReactNode
    nodeId: string
    // Trigger type: 'context' for right-click on children, 'dropdown' for a button usage (children is trigger)
    type?: "context" | "dropdown"
    asChild?: boolean
}

export function NodeContextMenu({
    children,
    nodeId,
    type = "context",
    asChild = false,
}: NodeContextMenuProps) {
    const { getNode, setNodes, addNodes, getNodes } = useReactFlow()

    const handleDelete = useCallback(() => {
        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId))
        toast.success("Node deleted")
    }, [nodeId, setNodes])

    const handleDuplicate = useCallback(() => {
        const node = getNode(nodeId)
        if (!node) return

        const position = {
            x: node.position.x + 50,
            y: node.position.y + 50,
        }

        const newNode = {
            ...node,
            id: `${node.type}-${Date.now()}`,
            position,
            selected: false,
            data: {
                ...node.data,
                label: `${node.data.label} (Copy)`,
            },
        }

        addNodes(newNode)
        toast.success("Node duplicated")
    }, [nodeId, getNode, addNodes])

    const handleCopy = useCallback(() => {
        const node = getNode(nodeId)
        if (!node) return

        // Simple copy to clipboard logic for node data
        // In a real app we might want to internal clipboard or serialize
        try {
            navigator.clipboard.writeText(JSON.stringify(node, null, 2))
            toast.success("Node data copied to clipboard")
        } catch (err) {
            // console.error(err)
            toast.error("Failed to copy node data")
        }
    }, [nodeId, getNode])

    const handleDownload = useCallback(() => {
        const node = getNode(nodeId)
        if (!node) return

        // Logic to determine what to download based on node type and data
        let url = '';
        let filename = `download-${nodeId}.png`; // Default extension

        if (node.data) {
            if (node.type?.includes('image') || node.type === 'imagen-4.0-generate-001' || node.type === 'gemini-3-pro-image-preview') {
                url = (node.data.output as string) || (node.data.imageUrl as string) || (node.data.assetPath as string) || '';
                filename = `image-${nodeId}.png`;
            } else if (node.type?.includes('video') || node.type === 'veo-3.1-generate-preview') {
                url = (node.data.output as string) || (node.data.videoUrl as string) || (node.data.assetPath as string) || '';
                filename = `video-${nodeId}.mp4`;
            }
        }

        if (url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))) {
            // Refine filename based on URL content if not already set
            if (url.match(/\.(mp4|webm)/i) || url.startsWith('data:video')) {
                if (!filename.endsWith('.mp4')) filename = filename.replace(/\.[^/.]+$/, "") + '.mp4';
            } else if (url.match(/\.(png|jpg|jpeg|webp)/i) || url.startsWith('data:image')) {
                if (!filename.endsWith('.png') && !filename.endsWith('.jpg') && !filename.endsWith('.jpeg') && !filename.endsWith('.webp')) {
                    filename = filename.replace(/\.[^/.]+$/, "") + '.png'; // Default to png if no specific image extension
                }
            }

            downloadMedia(url, filename);
            toast.success("Download started");
        } else {
            toast.error("No media content to download");
        }

    }, [nodeId, getNode])

    const node = getNode(nodeId)

    // Safe check for node and node.type
    const showDownload = node && node.type ? (
        (node.type.includes('image') || node.type.includes('video') || node.type === 'imagen-4.0-generate-001' || node.type === 'veo-3.1-generate-preview') &&
        (node.data && (node.data.output || node.data.imageUrl || node.data.videoUrl || node.data.assetPath))
    ) : false;


    const MenuItems = (
        <>
            <ContextMenuItem onSelect={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy Data
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleDuplicate} className="gap-2">
                <Files className="h-4 w-4" />
                Duplicate
            </ContextMenuItem>
            {showDownload && (
                <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={handleDownload} className="gap-2">
                        <Download className="h-4 w-4" />
                        Download
                    </ContextMenuItem>
                </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
                onSelect={handleDelete}
                className="text-destructive focus:text-destructive gap-2"
            >
                <Trash2 className="h-4 w-4" />
                Delete
            </ContextMenuItem>
        </>
    )

    const DropdownItems = (
        <>
            <DropdownMenuItem onSelect={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy Data
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleDuplicate} className="gap-2">
                <Files className="h-4 w-4" />
                Duplicate
            </DropdownMenuItem>
            {showDownload && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleDownload} className="gap-2">
                        <Download className="h-4 w-4" />
                        Download
                    </DropdownMenuItem>
                </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
                onSelect={handleDelete}
                className="text-destructive focus:text-destructive gap-2"
            >
                <Trash2 className="h-4 w-4" />
                Delete
            </DropdownMenuItem>
        </>
    )

    if (type === "dropdown") {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild={asChild}>{children}</DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {DropdownItems}
                </DropdownMenuContent>
            </DropdownMenu>
        )
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild={asChild}>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-48">{MenuItems}</ContextMenuContent>
        </ContextMenu>
    )
}
