"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import {
  Plus,
  Search,
  Grid3x3,
  List,
  MoreVertical,
  MoreHorizontal,
  FileText,
  Trash2,
  Copy,
  Pencil,
  Loader2,
  Package
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface Workflow {
  id: string
  name: string
  updatedAt: string
  createdAt: string
  thumbnail?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [workflowToRename, setWorkflowToRename] = useState<Workflow | null>(null)
  const [newName, setNewName] = useState("")

  useEffect(() => {
    fetchWorkflows()
  }, [])

  const fetchWorkflows = async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/workflows")
      if (res.ok) {
        const data = await res.json()
        setWorkflows(data)
      } else {
        toast.error("Failed to fetch workflows")
      }
    } catch (error) {
      console.error(error)
      toast.error("Error loading workflows")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateNewFile = async () => {
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled Workflow" })
      })
      if (res.ok) {
        const newWorkflow = await res.json()
        router.push(`/dashboard/editor/${newWorkflow.id}`)
      } else {
        toast.error("Failed to create workflow")
      }
    } catch (error) {
      toast.error("Error creating workflow")
    }
  }

  const handleOpenWorkflow = (id: string) => {
    router.push(`/dashboard/editor/${id}`)
  }

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return

    try {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Workflow deleted")
        fetchWorkflows()
      } else {
        toast.error("Failed to delete workflow")
      }
    } catch (error) {
      toast.error("Error deleting workflow")
    }
  }

  const handleDuplicateWorkflow = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}/duplicate`, { method: "POST" })
      if (res.ok) {
        toast.success("Workflow duplicated")
        fetchWorkflows()
      } else {
        toast.error("Failed to duplicate workflow")
      }
    } catch (error) {
      toast.error("Error duplicating workflow")
    }
  }

  const openRenameDialog = (workflow: Workflow) => {
    setWorkflowToRename(workflow)
    setNewName(workflow.name)
    setIsRenameDialogOpen(true)
  }

  const handleRenameSubmit = async () => {
    if (!workflowToRename) return
    try {
      const res = await fetch(`/api/workflows/${workflowToRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName })
      })
      if (res.ok) {
        toast.success("Workflow renamed")
        fetchWorkflows()
        setIsRenameDialogOpen(false)
      } else {
        toast.error("Failed to rename workflow")
      }
    } catch (error) {
      toast.error("Error renaming workflow")
    }
  }

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">My Workflows</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => toast.info("Import coming soon")}>
            <Package className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button onClick={handleCreateNewFile}>
            <Plus className="mr-2 h-4 w-4" /> Create New Workflow
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search workflows..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No workflows found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Get started by creating your first workflow
          </p>
          {!searchQuery && (
            <Button onClick={handleCreateNewFile}>
              <Plus className="mr-2 h-4 w-4" /> Create New Workflow
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1 -mx-4 px-4">
          {viewMode === 'grid' ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-10">
              {filteredWorkflows.map((workflow) => (
                <Card
                  key={workflow.id}
                  className="group hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden border-0 bg-card/50 backdrop-blur-sm hover:scale-[1.02]"
                  onClick={() => handleOpenWorkflow(workflow.id)}
                >
                  <div className="aspect-video bg-muted overflow-hidden relative">
                    {workflow.thumbnail ? (
                      <img
                        src={workflow.thumbnail}
                        alt={workflow.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
                        <FileText className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}

                    <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/80 hover:bg-background backdrop-blur-sm shadow-xs rounded-full">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenWorkflow(workflow.id)}>
                            <FileText className="mr-2 h-4 w-4" /> Open
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRenameDialog(workflow)}>
                            <Pencil className="mr-2 h-4 w-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateWorkflow(workflow.id)}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDeleteWorkflow(workflow.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold line-clamp-1">{workflow.name}</CardTitle>
                  </CardHeader>
                  <CardFooter className="pt-0 pb-3 text-xs text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span>Updated {formatDistanceToNow(new Date(workflow.updatedAt), { addSuffix: true })}</span>
                      <span className="text-muted-foreground/60">Created {formatDistanceToNow(new Date(workflow.createdAt), { addSuffix: true })}</span>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkflows.map((workflow) => (
                  <TableRow
                    key={workflow.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleOpenWorkflow(workflow.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-16 overflow-hidden rounded bg-muted relative flex-shrink-0">
                          {workflow.thumbnail ? (
                            <img src={workflow.thumbnail} alt={workflow.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-muted">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <span>{workflow.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDistanceToNow(new Date(workflow.updatedAt), { addSuffix: true })}</TableCell>
                    <TableCell>{formatDistanceToNow(new Date(workflow.createdAt), { addSuffix: true })}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenWorkflow(workflow.id) }}>
                            <FileText className="mr-2 h-4 w-4" /> Open
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openRenameDialog(workflow) }}>
                            <Pencil className="mr-2 h-4 w-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicateWorkflow(workflow.id) }}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(workflow.id) }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      )}

      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Workflow</DialogTitle>
            <DialogDescription>
              Enter a new name for your workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSubmit()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleRenameSubmit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
