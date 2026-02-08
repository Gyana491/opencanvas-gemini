"use client"

import { useCallback, useEffect, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { ClipboardPaste } from "lucide-react"

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface PaneContextMenuProps {
    children: React.ReactNode
    onPaste?: (position: { x: number; y: number }) => void
}

export function PaneContextMenu({ children, onPaste }: PaneContextMenuProps) {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        checkClipboard()
        const handleFocus = () => { void checkClipboard() }
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
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
            </ContextMenuContent>
        </ContextMenu>
    )
}
