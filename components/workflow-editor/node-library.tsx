"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Search, Sparkles, Zap, Eye, Box, Video, X, FileText, Image as ImageIcon } from "lucide-react"
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
            <div className="px-3 py-2 space-y-2">
              {nodeCategories.map((category) => (
                <div key={category.category}>
                  <h3 className="text-xs font-semibold mb-1 text-muted-foreground">
                    {category.category}
                  </h3>
                  <div className="space-y-1">
                    {category.nodes.map((node) => {
                      const Icon = node.icon
                      return (
                        <Card
                          key={node.id + category.category}
                          className="p-2 cursor-pointer hover:bg-accent transition-colors relative"
                          onClick={() => onAddNode(node.id)}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/reactflow', node.id)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                        >
                          {node.badge && (
                            <div className="absolute top-1.5 right-1.5 bg-orange-500/20 text-orange-600 dark:text-orange-400 text-[10px] px-1.5 py-0.5 rounded">
                              {node.badge}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className={`${node.color}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0 pr-5">
                              <div className="font-medium text-xs">{node.name}</div>
                              <div className="text-[11px] text-muted-foreground line-clamp-1">
                                {node.description}
                              </div>
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
