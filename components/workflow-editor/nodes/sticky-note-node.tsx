"use client"

import { memo } from "react"
import { type NodeProps, useReactFlow } from "@xyflow/react"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type StickyColorOption = {
  id: string
  name: string
  cardClassName: string
  textClassName: string
  dotClassName: string
}

const STICKY_COLOR_OPTIONS: StickyColorOption[] = [
  {
    id: "yellow",
    name: "Yellow",
    cardClassName: "bg-amber-200/95 border-amber-300",
    textClassName: "text-amber-950 placeholder:text-amber-700/70",
    dotClassName: "bg-amber-300 border-amber-400",
  },
  {
    id: "mint",
    name: "Mint",
    cardClassName: "bg-emerald-200/95 border-emerald-300",
    textClassName: "text-emerald-950 placeholder:text-emerald-700/70",
    dotClassName: "bg-emerald-300 border-emerald-400",
  },
  {
    id: "blue",
    name: "Blue",
    cardClassName: "bg-sky-200/95 border-sky-300",
    textClassName: "text-sky-950 placeholder:text-sky-700/70",
    dotClassName: "bg-sky-300 border-sky-400",
  },
  {
    id: "pink",
    name: "Pink",
    cardClassName: "bg-rose-200/95 border-rose-300",
    textClassName: "text-rose-950 placeholder:text-rose-700/70",
    dotClassName: "bg-rose-300 border-rose-400",
  },
]

const FALLBACK_COLOR_ID = "yellow"

type StickyNodeData = {
  note?: string
  noteColor?: string
  onUpdateNodeData?: (id: string, data: Record<string, unknown>) => void
}

const HANDWRITING_FONT_STACK =
  '"Comic Sans MS", "Segoe Print", "Bradley Hand", "Marker Felt", "Chalkboard SE", cursive'

export const StickyNoteNode = memo(({ id, data, selected }: NodeProps) => {
  const { updateNodeData } = useReactFlow()
  const nodeData = (data || {}) as StickyNodeData
  const note = typeof nodeData.note === "string" ? nodeData.note : ""
  const requestedColorId = typeof nodeData.noteColor === "string" ? nodeData.noteColor : FALLBACK_COLOR_ID
  const activeColor = STICKY_COLOR_OPTIONS.find((option) => option.id === requestedColorId) || STICKY_COLOR_OPTIONS[0]

  const persistNodeData = (nextData: Record<string, unknown>) => {
    if (typeof nodeData.onUpdateNodeData === "function") {
      nodeData.onUpdateNodeData(id, nextData)
      return
    }
    updateNodeData(id, nextData)
  }

  return (
    <Card
      className={cn(
        "relative min-w-[280px] border-2 shadow-sm transition-all",
        selected ? "ring-2 ring-offset-1 ring-zinc-700" : "hover:shadow-md",
        activeColor.cardClassName
      )}
      onContextMenuCapture={(event) => {
        // Keep browser-native context menu for sticky notes.
        event.stopPropagation()
      }}
      onContextMenu={(event) => {
        event.stopPropagation()
      }}
    >
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-1.5 nodrag nopan nowheel">
            {STICKY_COLOR_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "h-4 w-4 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700/60",
                  option.dotClassName,
                  option.id === activeColor.id ? "ring-2 ring-zinc-700/60 ring-offset-1 ring-offset-transparent" : ""
                )}
                title={option.name}
                onClick={(event) => {
                  event.stopPropagation()
                  persistNodeData({ noteColor: option.id })
                }}
              />
            ))}
          </div>
        </div>

        <Textarea
          value={note}
          placeholder="Write a note..."
          className={cn(
            "min-h-[190px] resize-none border-0 bg-transparent p-0 text-2xl font-semibold leading-9 shadow-none focus-visible:ring-0 nodrag nowheel",
            activeColor.textClassName
          )}
          style={{ fontFamily: HANDWRITING_FONT_STACK }}
          onClick={(event) => {
            event.stopPropagation()
          }}
          onChange={(event) => {
            persistNodeData({ note: event.target.value })
          }}
        />
      </div>
    </Card>
  )
})

StickyNoteNode.displayName = "StickyNoteNode"
