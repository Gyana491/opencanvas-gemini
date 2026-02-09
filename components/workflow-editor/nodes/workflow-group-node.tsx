"use client"

import { memo, useState, useCallback, useRef } from 'react'
import { type NodeProps, useReactFlow } from '@xyflow/react'
import { Input } from '@/components/ui/input'
import { NodeContextMenu } from '../node-context-menu'

const DEFAULT_GROUP_TITLE = 'Group'
const MIN_GROUP_WIDTH = 200
const MIN_GROUP_HEIGHT = 150

type GroupLabelSize = 'small' | 'medium' | 'large'
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null

export const WorkflowGroupNode = memo(({ data, id, selected, ...props }: NodeProps) => {
  const { updateNodeData, getNode, setNodes } = useReactFlow()
  const node = getNode(id)
  const titleFromData =
    typeof data?.title === 'string' && data.title.trim().length > 0
      ? data.title
      : typeof data?.label === 'string' && data.label.trim().length > 0
        ? data.label
        : DEFAULT_GROUP_TITLE

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(titleFromData)
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{
    direction: ResizeDirection
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    startPosX: number
    startPosY: number
  } | null>(null)

  const labelSize: GroupLabelSize =
    data?.labelSize === 'small' || data?.labelSize === 'large' ? data.labelSize : 'medium'
  const titleClassName =
    labelSize === 'small'
      ? 'px-2.5 py-1 text-xs'
      : labelSize === 'large'
        ? 'px-3.5 py-2 text-base'
        : 'px-3 py-1.5 text-sm'
  const inputClassName =
    labelSize === 'small'
      ? 'text-xs'
      : labelSize === 'large'
        ? 'text-base'
        : 'text-sm'

  const commitTitle = () => {
    const nextTitle = titleDraft.trim() || DEFAULT_GROUP_TITLE
    updateNodeData(id, {
      title: nextTitle,
      label: nextTitle,
    })
    setIsEditingTitle(false)
  }

  // Get current dimensions
  const currentWidth = typeof node?.style?.width === 'number'
    ? node.style.width
    : typeof node?.width === 'number'
      ? node.width
      : 380
  const currentHeight = typeof node?.style?.height === 'number'
    ? node.style.height
    : typeof node?.height === 'number'
      ? node.height
      : 260

  const handleResizeStart = useCallback((
    e: React.PointerEvent,
    direction: ResizeDirection
  ) => {
    e.stopPropagation()
    e.preventDefault()

    if (!node) return

    resizeRef.current = {
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      startPosX: node.position.x,
      startPosY: node.position.y,
    }

    setIsResizing(true)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current) return

      const { direction: dir, startX, startY, startWidth, startHeight, startPosX, startPosY } = resizeRef.current
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      let newWidth = startWidth
      let newHeight = startHeight
      let newPosX = startPosX
      let newPosY = startPosY

      // Handle horizontal resize
      if (dir?.includes('e')) {
        newWidth = Math.max(MIN_GROUP_WIDTH, startWidth + deltaX)
      }
      if (dir?.includes('w')) {
        const widthChange = Math.min(deltaX, startWidth - MIN_GROUP_WIDTH)
        newWidth = startWidth - widthChange
        newPosX = startPosX + widthChange
      }

      // Handle vertical resize
      if (dir?.includes('s')) {
        newHeight = Math.max(MIN_GROUP_HEIGHT, startHeight + deltaY)
      }
      if (dir?.includes('n')) {
        const heightChange = Math.min(deltaY, startHeight - MIN_GROUP_HEIGHT)
        newHeight = startHeight - heightChange
        newPosY = startPosY + heightChange
      }

      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id
            ? {
              ...n,
              position: { x: newPosX, y: newPosY },
              style: {
                ...n.style,
                width: Math.round(newWidth),
                height: Math.round(newHeight),
              },
            }
            : n
        )
      )
    }

    const handlePointerUp = () => {
      resizeRef.current = null
      setIsResizing(false)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }, [id, node, currentWidth, currentHeight, setNodes])

  // Resize handle styles
  const handleBaseStyle = "absolute bg-transparent z-30 nodrag nopan"
  const cornerSize = 12
  const edgeThickness = 8

  return (
    <NodeContextMenu nodeId={id} type="context">
      <div
        className={`relative h-full w-full rounded-2xl border bg-slate-500/10 ${selected ? 'border-slate-200/50' : 'border-slate-300/25'
          } ${isResizing ? 'select-none' : ''}`}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl border border-dashed border-slate-200/20" />

        <div className="absolute left-3 -top-10 z-20 nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
          {isEditingTitle ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitTitle()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setTitleDraft(titleFromData)
                  setIsEditingTitle(false)
                }
              }}
              className={`h-8 min-w-[140px] rounded-md border border-slate-300/40 bg-slate-300/30 px-2 text-white ${inputClassName}`}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(titleFromData)
                setIsEditingTitle(true)
              }}
              className={`rounded-md border border-slate-300/35 bg-slate-300/30 font-medium text-white ${titleClassName}`}
            >
              {titleFromData}
            </button>
          )}
        </div>

        {/* Corner resize handles */}
        <div
          className={`${handleBaseStyle} cursor-nwse-resize`}
          style={{ top: -cornerSize / 2, left: -cornerSize / 2, width: cornerSize, height: cornerSize }}
          onPointerDown={(e) => handleResizeStart(e, 'nw')}
        />
        <div
          className={`${handleBaseStyle} cursor-nesw-resize`}
          style={{ top: -cornerSize / 2, right: -cornerSize / 2, width: cornerSize, height: cornerSize }}
          onPointerDown={(e) => handleResizeStart(e, 'ne')}
        />
        <div
          className={`${handleBaseStyle} cursor-nesw-resize`}
          style={{ bottom: -cornerSize / 2, left: -cornerSize / 2, width: cornerSize, height: cornerSize }}
          onPointerDown={(e) => handleResizeStart(e, 'sw')}
        />
        <div
          className={`${handleBaseStyle} cursor-nwse-resize`}
          style={{ bottom: -cornerSize / 2, right: -cornerSize / 2, width: cornerSize, height: cornerSize }}
          onPointerDown={(e) => handleResizeStart(e, 'se')}
        />

        {/* Edge resize handles */}
        <div
          className={`${handleBaseStyle} cursor-ns-resize`}
          style={{ top: -edgeThickness / 2, left: cornerSize, right: cornerSize, height: edgeThickness }}
          onPointerDown={(e) => handleResizeStart(e, 'n')}
        />
        <div
          className={`${handleBaseStyle} cursor-ns-resize`}
          style={{ bottom: -edgeThickness / 2, left: cornerSize, right: cornerSize, height: edgeThickness }}
          onPointerDown={(e) => handleResizeStart(e, 's')}
        />
        <div
          className={`${handleBaseStyle} cursor-ew-resize`}
          style={{ left: -edgeThickness / 2, top: cornerSize, bottom: cornerSize, width: edgeThickness }}
          onPointerDown={(e) => handleResizeStart(e, 'w')}
        />
        <div
          className={`${handleBaseStyle} cursor-ew-resize`}
          style={{ right: -edgeThickness / 2, top: cornerSize, bottom: cornerSize, width: edgeThickness }}
          onPointerDown={(e) => handleResizeStart(e, 'e')}
        />
      </div>
    </NodeContextMenu>
  )
})

WorkflowGroupNode.displayName = 'WorkflowGroupNode'

