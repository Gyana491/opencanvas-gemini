"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Link as LinkIcon, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ShareDialogProps {
  isOpen: boolean
  onClose: () => void
  workflowId: string | null
}

export function ShareDialog({ isOpen, onClose, workflowId }: ShareDialogProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isShared, setIsShared] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const [isCopied, setIsCopied] = useState(false)

  const isDisabled = !workflowId || workflowId === "new"

  const accessDescription = useMemo(
    () => "Anyone with this link can view this workflow in read-only mode and duplicate it.",
    []
  )

  useEffect(() => {
    if (!isOpen || isDisabled) return

    let cancelled = false

    const loadStatus = async () => {
      try {
        setIsLoadingStatus(true)
        setShareUrl("")
        setIsCopied(false)

        const res = await fetch(`/api/workflows/${workflowId}/share`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || "Failed to load share status")
        }

        const data = await res.json()
        if (!cancelled) {
          setIsShared(Boolean(data?.shared))
          if (data?.shared && typeof data?.sharePath === "string" && data.sharePath.length > 0) {
            const origin = window.location.origin
            setShareUrl(`${origin}${data.sharePath}`)
          } else {
            setShareUrl("")
          }
        }
      } catch (error) {
        if (!cancelled) {
          setIsShared(false)
          setShareUrl("")
          toast.error(error instanceof Error ? error.message : "Failed to load share status")
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false)
        }
      }
    }

    loadStatus()

    return () => {
      cancelled = true
    }
  }, [isOpen, workflowId, isDisabled])

  const handleCreateLink = async () => {
    if (isDisabled) {
      toast.error("Please save the workflow before sharing")
      return
    }

    try {
      setIsCreating(true)
      const res = await fetch(`/api/workflows/${workflowId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || "Failed to create share link")
      }

      const data = await res.json()
      const origin = window.location.origin
      const url = `${origin}${data.sharePath}`
      setShareUrl(url)
      setIsShared(true)
      setIsCopied(false)
      toast.success("Share link created")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create share link")
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setIsCopied(true)
      toast.success("Share link copied")
      setTimeout(() => setIsCopied(false), 1500)
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const handleStopSharing = async () => {
    if (isDisabled) return

    try {
      setIsRevoking(true)

      const res = await fetch(`/api/workflows/${workflowId}/share`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || "Failed to stop sharing")
      }

      setIsShared(false)
      setShareUrl("")
      setIsCopied(false)
      toast.success("Sharing disabled")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stop sharing")
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Workflow</DialogTitle>
          <DialogDescription>
            Generate a read-only share link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">{accessDescription}</p>
          {isLoadingStatus && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading share settings...
            </div>
          )}
          {isShared && !shareUrl && !isLoadingStatus && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This workflow is currently shared.
            </p>
          )}

          {shareUrl && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-2">{isCopied ? "Copied" : "Copy Link"}</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {isShared ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleStopSharing}
              disabled={isRevoking || isLoadingStatus}
            >
              {isRevoking ? "Stopping..." : "Stop Sharing"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleCreateLink}
              disabled={isCreating || isDisabled || isLoadingStatus || isRevoking}
            >
              <LinkIcon className="mr-2 h-4 w-4" />
              {isLoadingStatus ? "Loading..." : isCreating ? "Creating..." : "Create Link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
