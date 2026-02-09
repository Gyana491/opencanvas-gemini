"use client"

import React from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Sparkles, Zap, Eye, Box, Video, X, FileText, Image as ImageIcon, GripHorizontal, LucideIcon, StickyNote, ScanText, GitMerge, Film, ChevronDown, Edit3 } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { MODELS, Model } from "@/data/models"
import { TOOLS, Tool } from "@/data/tools"
import { PROVIDERS } from "@/data/providers"

interface NodeLibraryProps {
  onAddNode: (nodeType: string) => void
  onClose: () => void
  isOpen: boolean
  workflowName?: string
  onRename?: (newName: string) => void
  scrollToCategory?: { id: string; token: number } | null
}

type HandleFilter = 'any' | 'text' | 'image' | 'video'
const categoryMapping: Record<string, string> = {
  google: 'Google AI Models',
  input: 'Input Nodes',
  search: 'Agent Tools',
  media: 'Media Tools',
  calculation: 'Utility Tools',
  other: 'Other Tools',
}

export const getNodeLibraryCategory = (item: Model | Tool) => {
  if ('providerId' in item) return categoryMapping[item.providerId] || 'Other Models'
  if ('category' in item) return categoryMapping[item.category] || 'Other Tools'
  return 'General Nodes'
}

const getIcon = (item: Model | Tool) => {
  // Priority 1: Provider Logo (for Models)
  if ('providerId' in item && item.providerId) {
    const provider = PROVIDERS.find(p => p.id === item.providerId)
    if (provider?.logo) return provider.logo
  }

  // Priority 2: Specific Hardcoded Overrides (if needed, but usually provider logo is preferred)
  // if (item.id === 'gemini-3-pro-image-preview') return Sparkles; // User wants provider logo, so removing this

  // Priority 3: Type/Category Defaults
  if ('type' in item && item.type === 'video') return Video
  if ('category' in item && item.category === 'input') {
    if (item.id === 'textInput') return FileText
    if (item.id === 'stickyNote') return StickyNote
    if (item.id === 'videoUpload') return Video
    return ImageIcon
  }
  if (item.id === 'promptEnhancer') return Sparkles
  if (item.id === 'imageDescriber') return ScanText
  if (item.id === 'videoDescriber') return ScanText
  if (item.id === 'promptConcatenator') return GitMerge
  if (item.id === 'extractVideoFrame') return Film
  if (item.id === 'imageCompositor') return Box
  if (item.id === 'google-search') return Search

  return ImageIcon
}

const getColor = (item: Model | Tool) => {
  if (item.id === 'textInput') return 'text-blue-500'
  if (item.id === 'imageUpload') return 'text-purple-500'
  if (item.id === 'videoUpload') return 'text-violet-500'
  if (item.id === 'stickyNote') return 'text-amber-500'
  if (item.id === 'imageDescriber') return 'text-fuchsia-500'
  if (item.id === 'videoDescriber') return 'text-violet-500'
  if (item.id === 'promptEnhancer') return 'text-pink-500'
  if (item.id === 'promptConcatenator') return 'text-fuchsia-500'
  if (item.id === 'extractVideoFrame') return 'text-emerald-500'
  if (item.id === 'imageCompositor') return 'text-emerald-500'
  if (item.id === 'gemini-2.5-flash-image') return 'text-orange-500'
  if (item.id === 'gemini-3-pro-image-preview') return 'text-pink-500'
  if (item.id === 'veo-3.1-generate-preview') return 'text-violet-500'
  if (item.id === 'google-search') return 'text-blue-400'
  return 'text-emerald-500'
}

// Merge all items for category generation
const ALL_ITEMS = [...(MODELS as (Model | Tool)[]), ...TOOLS]

export const NODE_LIBRARY_CATEGORY_ORDER = [
  'Input Nodes',
  'Agent Tools',
  'Media Tools',
  'Utility Tools',
  'Other Tools',
  'Google AI Models',
  'Other Models',
  'General Nodes',
]

const getCategorySortIndex = (category: string) => {
  const index = NODE_LIBRARY_CATEGORY_ORDER.indexOf(category)
  return index === -1 ? NODE_LIBRARY_CATEGORY_ORDER.length : index
}

export const getNodeLibraryCategoryId = (category: string) => {
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `node-library-${slug}`
}

export function NodeLibrary({ onAddNode, onClose, isOpen, workflowName, onRename, scrollToCategory }: NodeLibraryProps) {
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [localName, setLocalName] = React.useState(workflowName || "")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [inputFilter, setInputFilter] = React.useState<HandleFilter>('any')
  const [outputFilter, setOutputFilter] = React.useState<HandleFilter>('any')

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const nodeCategories = React.useMemo(() => {
    const resolveHandles = (item: Model | Tool, direction: 'input' | 'output') => {
      const handles = direction === 'input' ? item.inputs : item.outputs
      if (!Array.isArray(handles)) return []
      return handles
        .map((handle) => handle?.type)
        .filter((type): type is HandleFilter => type === 'text' || type === 'image' || type === 'video')
    }

    const filteredItems = normalizedQuery.length === 0
      ? ALL_ITEMS
      : ALL_ITEMS.filter((item) => {
        const name = item.title.toLowerCase()
        const description = item.description?.toLowerCase() || ""
        const category = getNodeLibraryCategory(item).toLowerCase()
        return name.includes(normalizedQuery) || description.includes(normalizedQuery) || category.includes(normalizedQuery)
      })

    const handleFilteredItems = filteredItems.filter((item) => {
      if (inputFilter !== 'any') {
        const inputTypes = resolveHandles(item, 'input')
        if (!inputTypes.includes(inputFilter)) {
          return false
        }
      }

      if (outputFilter !== 'any') {
        const outputTypes = resolveHandles(item, 'output')
        if (!outputTypes.includes(outputFilter)) {
          return false
        }
      }

      return true
    })

    const categoriesSet = new Set(handleFilteredItems.map(getNodeLibraryCategory))
    return Array.from(categoriesSet)
      .sort((a, b) => {
        const aIndex = getCategorySortIndex(a)
        const bIndex = getCategorySortIndex(b)
        if (aIndex !== bIndex) return aIndex - bIndex
        return a.localeCompare(b)
      })
      .map((categoryName) => ({
        category: categoryName,
        nodes: handleFilteredItems
          .filter((item) => getNodeLibraryCategory(item) === categoryName)
          .map((item) => ({
            id: item.id,
            name: item.title,
            description: item.description,
            icon: getIcon(item),
            color: getColor(item),
            badge: (item as Model).badge,
          })),
      }))
  }, [normalizedQuery, inputFilter, outputFilter])

  React.useEffect(() => {
    if (!scrollToCategory?.id || !isOpen) {
      return
    }

    setSearchQuery("")

    const target = document.getElementById(scrollToCategory.id)
    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [scrollToCategory?.token, scrollToCategory?.id, isOpen])

  const filterLabel = (value: HandleFilter) => {
    if (value === 'any') return 'Any'
    return value.charAt(0).toUpperCase() + value.slice(1)
  }

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
          className="w-[min(20rem,calc(100vw-3.5rem))] sm:w-64 border-r bg-background absolute left-0 top-0 bottom-0 z-40 shadow-lg flex flex-col min-h-0"
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
                <div className="flex items-center gap-1">
                  <h2
                    className="text-sm font-semibold cursor-text truncate max-w-[150px] hover:text-muted-foreground transition-colors"
                    onClick={() => setIsEditingName(true)}
                    title="Click to rename"
                  >
                    {localName || "Untitled Workflow"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsEditingName(true)}
                    aria-label="Rename workflow"
                    title="Rename"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wide">From</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-6 px-2 text-xs">
                    <span>{filterLabel(inputFilter)}</span>
                    <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(['any', 'text', 'image', 'video'] as HandleFilter[]).map((value) => (
                    <DropdownMenuItem key={value} onClick={() => setInputFilter(value)}>
                      {filterLabel(value)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-[10px] uppercase tracking-wide">to</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-6 px-2 text-xs">
                    <span>{filterLabel(outputFilter)}</span>
                    <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(['any', 'text', 'image', 'video'] as HandleFilter[]).map((value) => (
                    <DropdownMenuItem key={value} onClick={() => setOutputFilter(value)}>
                      {filterLabel(value)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div className="p-4 space-y-6">
              {nodeCategories.length === 0 ? (
                <div className="text-xs text-muted-foreground px-1">No nodes match your search.</div>
              ) : (
                nodeCategories.map((category) => (
                  <div
                    key={category.category}
                    id={getNodeLibraryCategoryId(category.category)}
                    className="space-y-3"
                  >
                    <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">
                      {category.category}
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {category.nodes.map((node) => {
                        const Icon = node.icon as LucideIcon
                        return (
                          <div
                            key={node.id}
                            className="group flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
                            onDragStart={(event) => onDragStart(event, node.id, node.id)}
                            draggable
                          >
                            <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors overflow-hidden">
                              {typeof node.icon === 'string' ? (
                                <img src={node.icon} alt={node.name} className="w-full h-full object-cover" />
                              ) : (
                                <Icon className={`w-4 h-4 ${node.color}`} />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                                {node.name}
                              </span>
                              <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400">
                                {node.description || category.category}
                              </span>
                            </div>
                            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                              <GripHorizontal className="w-4 h-4 text-zinc-600" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
