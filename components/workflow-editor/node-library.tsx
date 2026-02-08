"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Search, Sparkles, Zap, Eye, Box, Video, X, FileText, Image as ImageIcon, GripHorizontal, LucideIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { MODELS, Model } from "@/data/models"
import { TOOLS, Tool } from "@/data/tools"

interface NodeLibraryProps {
  onAddNode: (nodeType: string) => void
  onClose: () => void
  isOpen: boolean
  workflowName?: string
  onRename?: (newName: string) => void
}
const categoryMapping: Record<string, string> = {
  'google': 'Google AI Models',
  'input': 'Input Nodes',
  'search': 'Agent Tools'
};

const getCategory = (item: Model | Tool) => {
  if ('providerId' in item) return categoryMapping[item.providerId] || 'Other Models';
  if ('category' in item) return categoryMapping[item.category] || 'Other Tools';
  return 'General Nodes';
};

const getIcon = (item: Model | Tool) => {
  if ('type' in item && item.type === 'video') return Video;
  if ('category' in item && item.category === 'input') {
    return item.id === 'textInput' ? FileText : ImageIcon;
  }
  if (item.id === 'gemini-3-pro-image-preview') return Sparkles;
  if (item.id === 'google-search') return Search;
  return ImageIcon;
};

const getColor = (item: Model | Tool) => {
  if (item.id === 'textInput') return 'text-blue-500';
  if (item.id === 'imageUpload') return 'text-purple-500';
  if (item.id === 'gemini-2.5-flash-image') return 'text-orange-500';
  if (item.id === 'gemini-3-pro-image-preview') return 'text-pink-500';
  if (item.id === 'veo-3.1-generate-preview') return 'text-violet-500';
  if (item.id === 'google-search') return 'text-blue-400';
  return 'text-emerald-500';
};

// Merge all items for category generation
const ALL_ITEMS = [...(MODELS as (Model | Tool)[]), ...TOOLS.filter(t => t.category === 'input')];

// Generate categories from ALL_ITEMS
const categoriesSet = new Set(ALL_ITEMS.map(getCategory));
const nodeCategories = Array.from(categoriesSet)
  .sort((a, b) => {
    if (a === 'Input Nodes') return -1;
    if (b === 'Input Nodes') return 1;
    return 0;
  })
  .map(categoryName => ({
    category: categoryName,
    nodes: ALL_ITEMS.filter(item => getCategory(item) === categoryName).map(item => ({
      id: item.id,
      name: item.title,
      description: item.description,
      icon: getIcon(item),
      color: getColor(item),
      badge: (item as Model).badge
    }))
  }));

export function NodeLibrary({ onAddNode, onClose, isOpen, workflowName, onRename }: NodeLibraryProps) {
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [localName, setLocalName] = React.useState(workflowName || "")

  React.useEffect(() => {
    setLocalName(workflowName || "")
  }, [workflowName])

  const handleNameSave = () => {
    if (!onRename) return
    const nameToSave = localName.trim() || "Untitled Workflow"
    onRename(nameToSave)
    setLocalName(nameToSave)
    setIsEditingName(false)
  }

  const onDragStart = (event: React.DragEvent, nodeType: string, nodeId?: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="w-64 border-r bg-background absolute left-0 top-0 bottom-0 z-40 shadow-lg flex flex-col"
        >
          <div className="px-3 py-2 border-b">
            <div className="flex items-center justify-between mb-2 h-8">
              {isEditingName ? (
                <Input
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleNameSave()
                    }
                  }}
                  className="h-7 px-2 text-sm font-semibold w-[180px]"
                  autoFocus
                />
              ) : (
                <h2
                  className="text-sm font-semibold cursor-text truncate max-w-[180px] hover:text-muted-foreground transition-colors"
                  onClick={() => setIsEditingName(true)}
                  title="Click to rename"
                >
                  {localName || "Untitled Workflow"}
                </h2>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-6 w-6 ml-auto"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search nodes..."
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Models Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">Models</h3>
                <div className="grid grid-cols-1 gap-2">
                  {MODELS.map((model) => {
                    const Icon = getIcon(model);
                    return (
                      <div
                        key={model.id}
                        className="group flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
                        onDragStart={(event) => onDragStart(event, model.id, model.id)}
                        draggable
                      >
                        <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors overflow-hidden">
                          {typeof Icon === 'string' ? (
                            <img src={Icon} alt={model.title} className="w-full h-full object-cover" />
                          ) : (
                            <Icon className="w-4 h-4 text-zinc-100" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                            {model.title}
                          </span>
                          <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400">
                            {model.providerId === 'google' ? 'Google AI' : 'Model'}
                          </span>
                        </div>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripHorizontal className="w-4 h-4 text-zinc-600" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tools Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">Tools</h3>
                <div className="grid grid-cols-1 gap-2">
                  {TOOLS.map((tool) => {
                    const Icon = getIcon(tool) as LucideIcon; // Tools use Lucide Icons
                    return (
                      <div
                        key={tool.id}
                        className="group flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
                        onDragStart={(event) => onDragStart(event, tool.id, tool.id)}
                        draggable
                      >
                        <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                          <Icon className="w-4 h-4 text-zinc-100" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                            {tool.title}
                          </span>
                          <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400">
                            {tool.category || 'Utility'}
                          </span>
                        </div>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripHorizontal className="w-4 h-4 text-zinc-600" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
