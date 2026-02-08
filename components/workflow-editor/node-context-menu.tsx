"use client"

import { useCallback, useMemo } from "react"
import { useReactFlow, type Node } from "@xyflow/react"
import { Check, Copy, FolderPlus, Trash2, Files, Download } from "lucide-react"
import { toast } from "sonner"
import { downloadMedia } from "@/lib/utils/download"

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuShortcut,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
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

const GROUP_NODE_TYPE = 'workflowGroup'
const GROUP_PADDING_X = 48
const GROUP_PADDING_Y = 48
const MIN_GROUP_WIDTH = 380
const MIN_GROUP_HEIGHT = 260

type GroupLabelSize = 'small' | 'medium' | 'large'

type FlowNodeLike = {
    id: string
    type?: string
    position: { x: number; y: number }
    parentId?: string
    width?: number
    height?: number
    measured?: { width?: number; height?: number }
    data?: Record<string, unknown>
    selected?: boolean
}

function getNodeDimension(node: FlowNodeLike, axis: 'width' | 'height'): number {
    const measured = node?.measured
    if (axis === 'width') {
        return Math.max(
            1,
            Math.round(
                (typeof node?.width === 'number' ? node.width : undefined) ??
                (typeof measured?.width === 'number' ? measured.width : undefined) ??
                320
            )
        )
    }

    return Math.max(
        1,
        Math.round(
            (typeof node?.height === 'number' ? node.height : undefined) ??
            (typeof measured?.height === 'number' ? measured.height : undefined) ??
            180
        )
    )
}

function getAbsoluteNodePosition(node: FlowNodeLike, nodeMap: Map<string, FlowNodeLike>): { x: number; y: number } {
    let x = node.position.x
    let y = node.position.y
    let parentId = node.parentId

    while (parentId) {
        const parent = nodeMap.get(parentId)
        if (!parent) break
        x += parent.position.x
        y += parent.position.y
        parentId = parent.parentId
    }

    return { x, y }
}

export function NodeContextMenu({
    children,
    nodeId,
    type = "context",
    asChild = false,
}: NodeContextMenuProps) {
    const { getNode, setNodes, addNodes, getNodes, getEdges, setEdges } = useReactFlow()
    const allNodes = getNodes() as FlowNodeLike[]
    const allEdges = getEdges()
    const selectedNodes = allNodes.filter((n) => n.selected)
    const selectedIds = useMemo(() => new Set(selectedNodes.map((n) => n.id)), [selectedNodes])
    const selectedGroupableNodes = selectedNodes.filter((n) => n.type !== GROUP_NODE_TYPE)
    const node = getNode(nodeId)
    const isGroupNode = node?.type === GROUP_NODE_TYPE
    const groupLabelSize: GroupLabelSize =
        node?.data?.labelSize === 'small' || node?.data?.labelSize === 'large' ? node.data.labelSize : 'medium'

    const handleGroupSelection = useCallback(() => {
        if (selectedGroupableNodes.length < 2) {
            toast.error("Select at least two nodes to create a group")
            return
        }

        const nodeMap = new Map(allNodes.map((currentNode) => [currentNode.id, currentNode]))
        const rootNodes = selectedGroupableNodes.filter((currentNode) => {
            let parentId = currentNode.parentId
            while (parentId) {
                if (selectedIds.has(parentId)) {
                    return false
                }
                const parent = nodeMap.get(parentId)
                if (!parent) break
                parentId = parent.parentId
            }
            return true
        })

        if (rootNodes.length < 2) {
            toast.error("Select at least two top-level nodes to create a group")
            return
        }

        const bounds = rootNodes.map((currentNode) => {
            const absolute = getAbsoluteNodePosition(currentNode, nodeMap)
            return {
                node: currentNode,
                x: absolute.x,
                y: absolute.y,
                width: getNodeDimension(currentNode, 'width'),
                height: getNodeDimension(currentNode, 'height'),
            }
        })
        const minX = Math.min(...bounds.map((bound) => bound.x))
        const minY = Math.min(...bounds.map((bound) => bound.y))
        const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width))
        const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height))
        const groupX = Math.round(minX - GROUP_PADDING_X)
        const groupY = Math.round(minY - GROUP_PADDING_Y)
        const groupWidth = Math.round(Math.max(MIN_GROUP_WIDTH, maxX - minX + GROUP_PADDING_X * 2))
        const groupHeight = Math.round(Math.max(MIN_GROUP_HEIGHT, maxY - minY + GROUP_PADDING_Y * 2))
        const groupId = `${GROUP_NODE_TYPE}-${Date.now()}`
        const groupedRootIds = new Set(rootNodes.map((currentNode) => currentNode.id))

        setNodes((currentNodes) => {
            const currentMap = new Map(currentNodes.map((currentNode) => [currentNode.id, currentNode]))
            const reassigned = currentNodes.map((currentNode) => {
                if (!groupedRootIds.has(currentNode.id)) {
                    return {
                        ...currentNode,
                        selected: false,
                    }
                }
                const absolute = getAbsoluteNodePosition(currentNode, currentMap)
                return {
                    ...currentNode,
                    parentId: groupId,
                    extent: 'parent' as const,
                    position: {
                        x: Math.round(absolute.x - groupX),
                        y: Math.round(absolute.y - groupY),
                    },
                    selected: false,
                }
            })

            const groupNode = {
                id: groupId,
                type: GROUP_NODE_TYPE,
                position: { x: groupX, y: groupY },
                data: {
                    label: 'Group',
                    title: 'Group',
                    labelSize: 'medium',
                },
                style: {
                    width: groupWidth,
                    height: groupHeight,
                },
                selected: true,
            }

            const groupedChildren = reassigned.filter((currentNode) => groupedRootIds.has(currentNode.id))
            const otherNodes = reassigned.filter((currentNode) => !groupedRootIds.has(currentNode.id))
            return [...otherNodes, groupNode, ...groupedChildren]
        })
        toast.success("Grouped selected nodes")
    }, [allNodes, selectedGroupableNodes, selectedIds, setNodes])

    const handleDelete = useCallback(() => {
        if (selectedNodes.length > 1 && selectedIds.has(nodeId)) {
            setNodes((nodes) => nodes.filter((n) => !selectedIds.has(n.id)))
            toast.success("Deleted selected nodes")
            return
        }
        setNodes((nodes) => nodes.filter((n) => n.id !== nodeId))
        toast.success("Node deleted")
    }, [nodeId, selectedIds, selectedNodes.length, setNodes])

    const handleDuplicate = useCallback(() => {
        // Helper to get all nodes in a group (recursively)
        const getGroupDescendants = (groupId: string): FlowNodeLike[] => {
            const children = allNodes.filter(n => n.parentId === groupId)
            const descendants: FlowNodeLike[] = [...children]
            children.forEach(child => {
                if (child.type === GROUP_NODE_TYPE) {
                    descendants.push(...getGroupDescendants(child.id))
                }
            })
            return descendants
        }

        // Determine nodes to duplicate
        let nodesToDuplicate: FlowNodeLike[] = []

        if (selectedNodes.length > 1 && selectedIds.has(nodeId)) {
            // Multi-selection
            nodesToDuplicate = [...selectedNodes]
            // Include children of any selected groups
            selectedNodes.forEach(n => {
                if (n.type === GROUP_NODE_TYPE) {
                    const descendants = getGroupDescendants(n.id)
                    descendants.forEach(d => {
                        if (!nodesToDuplicate.find(nd => nd.id === d.id)) {
                            nodesToDuplicate.push(d)
                        }
                    })
                }
            })
        } else {
            // Single node
            const node = getNode(nodeId) as FlowNodeLike | undefined
            if (!node) return
            nodesToDuplicate = [node]
            // If it's a group, include all children
            if (node.type === GROUP_NODE_TYPE) {
                nodesToDuplicate.push(...getGroupDescendants(node.id))
            }
        }

        // Create ID mapping
        const idMap = new Map<string, string>()
        nodesToDuplicate.forEach((node, index) => {
            idMap.set(node.id, `${node.type}-${Date.now()}-${index}`)
        })

        const duplicatedNodeIds = new Set(nodesToDuplicate.map(n => n.id))

        // Find edges that connect nodes within our duplication set
        const edgesToDuplicate = allEdges.filter(e =>
            duplicatedNodeIds.has(e.source) && duplicatedNodeIds.has(e.target)
        )

        // Duplicate nodes with updated IDs and positions
        const duplicatedNodes: Node<Record<string, unknown>>[] = nodesToDuplicate.map((node) => {
            const newId = idMap.get(node.id) || `${node.type}-${Date.now()}`
            const mappedParentId = node.parentId && idMap.has(node.parentId)
                ? idMap.get(node.parentId)
                : node.parentId

            // Only add "Duplicate of" prefix to group titles
            let nodeData = { ...node.data } as Record<string, unknown>
            if (node.type === GROUP_NODE_TYPE && nodeData.title) {
                nodeData = {
                    ...nodeData,
                    title: `Duplicate of ${nodeData.title}`,
                    label: `Duplicate of ${nodeData.label || nodeData.title}`,
                }
            }

            return {
                ...node,
                type: node.type || 'textInput',
                data: nodeData,
                id: newId,
                position: {
                    x: node.position.x + (mappedParentId ? 0 : 40),
                    y: node.position.y + (mappedParentId ? 0 : 40),
                },
                parentId: mappedParentId,
                selected: !mappedParentId, // Only select top-level duplicated nodes
            }
        })

        // Duplicate edges with remapped IDs
        const duplicatedEdges = edgesToDuplicate.map((edge, index) => ({
            ...edge,
            id: `edge-${Date.now()}-${index}`,
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
        }))

        setNodes((nodes) => [...nodes.map((n) => ({ ...n, selected: false })), ...duplicatedNodes])
        setEdges((edges) => [...edges, ...duplicatedEdges])
        toast.success(nodesToDuplicate.length > 1 ? "Duplicated selection" : "Node duplicated")
    }, [nodeId, getNode, allNodes, allEdges, selectedIds, selectedNodes, setNodes, setEdges])

    const handleUngroup = useCallback(() => {
        const node = getNode(nodeId)
        if (!node || node.type !== GROUP_NODE_TYPE) return

        setNodes((nodes) => {
            const group = nodes.find((n) => n.id === nodeId)
            if (!group) return nodes

            const groupPosition = group.position
            return nodes
                .filter((n) => n.id !== nodeId)
                .map((n) => {
                    if (n.parentId !== nodeId) return n
                    return {
                        ...n,
                        parentId: undefined,
                        extent: undefined,
                        position: {
                            x: Math.round(groupPosition.x + n.position.x),
                            y: Math.round(groupPosition.y + n.position.y),
                        },
                    }
                })
        })

        toast.success("Group removed")
    }, [getNode, nodeId, setNodes])

    const handleSetGroupLabelSize = useCallback((size: GroupLabelSize) => {
        setNodes((nodes) =>
            nodes.map((n) =>
                n.id === nodeId
                    ? {
                        ...n,
                        data: {
                            ...n.data,
                            labelSize: size,
                        },
                    }
                    : n
            )
        )
    }, [nodeId, setNodes])

    const handleCopy = useCallback(() => {
        // Helper to get all nodes in a group (recursively)
        const getGroupDescendants = (groupId: string): FlowNodeLike[] => {
            const children = allNodes.filter(n => n.parentId === groupId)
            const descendants: FlowNodeLike[] = [...children]
            children.forEach(child => {
                if (child.type === GROUP_NODE_TYPE) {
                    descendants.push(...getGroupDescendants(child.id))
                }
            })
            return descendants
        }

        // Determine nodes to copy
        let nodesToCopy: FlowNodeLike[] = []

        if (selectedNodes.length > 1 && selectedIds.has(nodeId)) {
            // Multi-selection
            nodesToCopy = [...selectedNodes]
            // Include children of any selected groups
            selectedNodes.forEach(n => {
                if (n.type === GROUP_NODE_TYPE) {
                    const descendants = getGroupDescendants(n.id)
                    descendants.forEach(d => {
                        if (!nodesToCopy.find(nd => nd.id === d.id)) {
                            nodesToCopy.push(d)
                        }
                    })
                }
            })
        } else {
            // Single node
            const node = getNode(nodeId) as FlowNodeLike | undefined
            if (!node) return
            nodesToCopy = [node]
            // If it's a group, include all children
            if (node.type === GROUP_NODE_TYPE) {
                nodesToCopy.push(...getGroupDescendants(node.id))
            }
        }

        const copyNodeIds = new Set(nodesToCopy.map(n => n.id))

        // Find edges that connect nodes within our copy set
        const edgesToCopy = allEdges.filter(e =>
            copyNodeIds.has(e.source) && copyNodeIds.has(e.target)
        )

        // Prepare clipboard data
        const clipboardData = {
            nodes: nodesToCopy,
            edges: edgesToCopy,
        }

        try {
            navigator.clipboard.writeText(JSON.stringify(clipboardData, null, 2))
            toast.success(nodesToCopy.length > 1 ? "Selection copied to clipboard" : "Node copied to clipboard")
        } catch {
            toast.error("Failed to copy")
        }
    }, [nodeId, getNode, allNodes, allEdges, selectedIds, selectedNodes])

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

    // Safe check for node and node.type
    const showDownload = node && node.type ? (
        (node.type.includes('image') || node.type.includes('video') || node.type === 'imagen-4.0-generate-001' || node.type === 'veo-3.1-generate-preview') &&
        (node.data && (node.data.output || node.data.imageUrl || node.data.videoUrl || node.data.assetPath))
    ) : false;


    const MenuItems = (
        <>
            {selectedGroupableNodes.length >= 2 && (
                <>
                    <ContextMenuItem onSelect={handleGroupSelection} className="gap-2">
                        <FolderPlus className="h-4 w-4" />
                        Group selection
                        <ContextMenuShortcut>⌘G</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                </>
            )}
            <ContextMenuItem onSelect={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleDuplicate} className="gap-2">
                <Files className="h-4 w-4" />
                Duplicate
            </ContextMenuItem>
            {isGroupNode && (
                <>
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>Label size</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-40">
                            <ContextMenuItem onSelect={() => handleSetGroupLabelSize('small')} className="gap-2">
                                Small
                                {groupLabelSize === 'small' ? <Check className="ml-auto h-4 w-4" /> : null}
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => handleSetGroupLabelSize('medium')} className="gap-2">
                                Medium
                                {groupLabelSize === 'medium' ? <Check className="ml-auto h-4 w-4" /> : null}
                            </ContextMenuItem>
                            <ContextMenuItem onSelect={() => handleSetGroupLabelSize('large')} className="gap-2">
                                Large
                                {groupLabelSize === 'large' ? <Check className="ml-auto h-4 w-4" /> : null}
                            </ContextMenuItem>
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuItem onSelect={handleUngroup} className="gap-2">
                        Ungroup
                    </ContextMenuItem>
                </>
            )}
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
            {selectedGroupableNodes.length >= 2 && (
                <>
                    <DropdownMenuItem onSelect={handleGroupSelection} className="gap-2">
                        <FolderPlus className="h-4 w-4" />
                        Group selection
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                </>
            )}
            <DropdownMenuItem onSelect={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleDuplicate} className="gap-2">
                <Files className="h-4 w-4" />
                Duplicate
            </DropdownMenuItem>
            {isGroupNode && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => handleSetGroupLabelSize('small')}>
                        Label size: Small {groupLabelSize === 'small' ? '✓' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleSetGroupLabelSize('medium')}>
                        Label size: Medium {groupLabelSize === 'medium' ? '✓' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleSetGroupLabelSize('large')}>
                        Label size: Large {groupLabelSize === 'large' ? '✓' : ''}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleUngroup}>
                        Ungroup
                    </DropdownMenuItem>
                </>
            )}
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
