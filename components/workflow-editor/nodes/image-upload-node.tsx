"use client"

import { memo, useRef, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Upload, MoreVertical, X, Loader2 } from 'lucide-react'
import { uploadToR2 } from '@/lib/utils/upload'
import { NodeContextMenu } from '../node-context-menu'
import { OUTPUT_HANDLE_IDS } from '@/data/models'

export const ImageNode = memo(({ data, selected, id }: NodeProps) => {
  const params = useParams()
  const workflowId = params?.id as string
  const { updateNodeData } = useReactFlow()

  // Initialize state from data
  const initialImage = (data?.imageUrl as string) || ''
  const [preview, setPreview] = useState<string>(initialImage)
  const [isUploadingLocal, setIsUploadingLocal] = useState(false)
  const isUploading = isUploadingLocal || Boolean(data?.isUploading)
  const uploadError = (data?.uploadError as string) || ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update local state if data changes externally
  useEffect(() => {
    setPreview((data?.imageUrl as string) || '')
  }, [data?.imageUrl])



  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && workflowId) {
      setIsUploadingLocal(true)
      updateNodeData(id, {
        fileName: file.name,
        isUploading: true,
        uploadError: '',
      })
      try {
        // Upload to R2
        const response = await uploadToR2(file, workflowId, id, file.name)

        if (response.success && response.url) {
          const imageUrl = response.url
          setPreview(imageUrl)
          updateNodeData(id, {
            imageUrl: imageUrl,
            assetPath: imageUrl,
            fileName: file.name,
            isUploading: false,
            uploadError: '',
          })
        } else {
          console.error("Failed to upload asset:", response.error)
          setPreview('')
          updateNodeData(id, {
            imageUrl: '',
            assetPath: '',
            isUploading: false,
            uploadError: response.error || 'Upload failed',
          })
        }
      } catch (error) {
        console.error("Error uploading asset:", error)
        setPreview('')
        updateNodeData(id, {
          imageUrl: '',
          assetPath: '',
          isUploading: false,
          uploadError: 'Upload failed',
        })
      } finally {
        setIsUploadingLocal(false)
      }
    }
  }

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreview('')
    updateNodeData(id, {
      imageUrl: '',
      assetPath: '',
      fileName: '',
      isUploading: false,
      uploadError: '',
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <NodeContextMenu nodeId={id} type="context">
      <Card
        className={`relative min-w-[320px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
          }`}
      >
        <div className="p-3 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="font-semibold text-sm">Image Node</h3>
            </div>
            <NodeContextMenu nodeId={id} type="dropdown" asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </NodeContextMenu>
          </div>

          {/* Inputs */}
          <div className="space-y-3">

            {/* Image Input */}
            <div className="relative">
              {isUploading ? (
                <div className="h-56 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-md bg-muted/20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Uploading image...</span>
                </div>
              ) : preview ? (
                <div className="relative group/image">
                  <img
                    src={preview}
                    alt="Reference"
                    loading="lazy"
                    decoding="async"
                    crossOrigin="anonymous"
                    className="w-full h-56 object-contain rounded-md border border-border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/image:opacity-100 transition-opacity nodrag"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  className="h-56 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all nodrag"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center px-4">
                    Check reference image
                  </p>
                </div>
              )}
              {uploadError && (
                <p className="mt-2 text-xs text-destructive">{uploadError}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        {/* Outputs Handles - Positioned to look integrated */}

        {/* Image Handle */}
        <div
          className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-emerald-300"
          style={{ top: '50%' }}
        >
          Image
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={OUTPUT_HANDLE_IDS.image}
          className="!w-3 !h-3 !border-2 !bg-emerald-400 !border-emerald-200"
        />

      </Card>
    </NodeContextMenu>
  )
})

ImageNode.displayName = 'ImageNode'

// Export alias for backward compatibility if needed, or just standard export
export const ImageUploadNode = ImageNode

export const ImageNodeProperties = () => {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure the Image Node. Upload a reference image and provide text input.
      </p>
    </div>
  )
}

// Alias for properties too
export const ImageUploadProperties = ImageNodeProperties
