"use client"

import { useCallback, useEffect, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { ClipboardPaste, Copy, Files, FolderPlus, Trash2 } from "lucide-react"

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface PaneContextMenuProps {
    children: React.ReactNode
    onPaste?: (position: { x: number; y: number }) => void
    selectedNodeCount?: number
    onGroupSelection?: () => void
    onCopySelection?: () => void
    onDuplicateSelection?: () => void
    onDeleteSelection?: () => void
}

export function PaneContextMenu({
    children,
    onPaste,
    selectedNodeCount = 0,
    onGroupSelection,
    onCopySelection,
    onDuplicateSelection,
    onDeleteSelection,
}: PaneContextMenuProps) {
    const [canPaste, setCanPaste] = useState(false)
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null)

    const { screenToFlowPosition } = useReactFlow()

    const checkClipboard = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (!text) {
                setCanPaste(false)
                return
            }
            try {
                const data = JSON.parse(text)
                if (data && (data.id || data.nodes || data.type)) {
                    setCanPaste(true)
                } else {
                    setCanPaste(false)
                }
            } catch {
                // Not JSON
                setCanPaste(false)
            }
        } catch {
            // Access denied or empty
            setCanPaste(false)
        }
    }, [])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void checkClipboard()
        }, 0)
        const handleFocus = () => { void checkClipboard() }
        window.addEventListener('focus', handleFocus)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener('focus', handleFocus)
        }
    }, [checkClipboard])

    const handleContextMenu = (e: React.MouseEvent) => {
        // Capture position before menu opens
        setMenuPosition({ x: e.clientX, y: e.clientY })
        checkClipboard()
    }

    const onPasteSelect = () => {
        if (onPaste && menuPosition) {
            const flowPos = screenToFlowPosition({
                x: menuPosition.x,
                y: menuPosition.y
            })
            onPaste(flowPos)
        }
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger onContextMenu={handleContextMenu} asChild>
                {children}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={onPasteSelect} disabled={!canPaste} className="gap-2">
                    <ClipboardPaste className="h-4 w-4" />
                    Paste
                </ContextMenuItem>
                {selectedNodeCount > 0 && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            onSelect={onGroupSelection}
                            disabled={selectedNodeCount < 2}
                            className="gap-2"
                        >
                            <FolderPlus className="h-4 w-4" />
                            Group selection
                            <ContextMenuShortcut>⌘G</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={onCopySelection} className="gap-2">
                            <Copy className="h-4 w-4" />
                            Copy selection
                            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={onDuplicateSelection} className="gap-2">
                            <Files className="h-4 w-4" />
                            Duplicate selection
                        </ContextMenuItem>
                        <ContextMenuItem
                            onSelect={onDeleteSelection}
                            className="text-destructive focus:text-destructive gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}
