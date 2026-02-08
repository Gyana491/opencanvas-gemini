"use client"

import { memo, useState } from 'react'
import { type NodeProps, useReactFlow } from '@xyflow/react'
import { Input } from '@/components/ui/input'
import { NodeContextMenu } from '../node-context-menu'

const DEFAULT_GROUP_TITLE = 'Group'
type GroupLabelSize = 'small' | 'medium' | 'large'

export const WorkflowGroupNode = memo(({ data, id, selected }: NodeProps) => {
  const { updateNodeData } = useReactFlow()
  const titleFromData =
    typeof data?.title === 'string' && data.title.trim().length > 0
      ? data.title
      : typeof data?.label === 'string' && data.label.trim().length > 0
        ? data.label
        : DEFAULT_GROUP_TITLE

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(titleFromData)
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

  return (
    <NodeContextMenu nodeId={id} type="context">
      <div
        className={`relative h-full w-full rounded-2xl border bg-slate-500/10 ${
          selected ? 'border-slate-200/50' : 'border-slate-300/25'
        }`}
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
      </div>
    </NodeContextMenu>
  )
})

WorkflowGroupNode.displayName = 'WorkflowGroupNode'
