"use client"

import { memo, useRef, useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, MoreVertical, Upload, Video, X } from 'lucide-react'
import { uploadToR2 } from '@/lib/utils/upload'
import { NodeContextMenu } from '../node-context-menu'
import { OUTPUT_HANDLE_IDS } from '@/data/models'

const MAX_VIDEO_FILE_SIZE_BYTES = 200 * 1024 * 1024

export const VideoNode = memo(({ data, selected, id }: NodeProps) => {
  const params = useParams()
  const workflowId = params?.id as string
  const { updateNodeData } = useReactFlow()
  const localObjectUrlRef = useRef<string | null>(null)

  const initialVideo = (data?.videoBlobUrl as string) || (data?.videoUrl as string) || (data?.output as string) || ''
  const [preview, setPreview] = useState<string>(initialVideo)
  const [isUploadingLocal, setIsUploadingLocal] = useState(false)
  const isUploading = isUploadingLocal || Boolean(data?.isUploading)
  const uploadError = (data?.uploadError as string) || ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreview((data?.videoBlobUrl as string) || (data?.videoUrl as string) || (data?.output as string) || '')
  }, [data?.videoBlobUrl, data?.videoUrl, data?.output])

  useEffect(() => {
    return () => {
      if (localObjectUrlRef.current) {
        URL.revokeObjectURL(localObjectUrlRef.current)
        localObjectUrlRef.current = null
      }
    }
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workflowId) return

    if (!file.type.startsWith('video/')) {
      updateNodeData(id, { uploadError: 'Please select a valid video file.' })
      return
    }

    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
      updateNodeData(id, { uploadError: 'Video file must be 200MB or smaller.' })
      return
    }

    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current)
      localObjectUrlRef.current = null
    }
    const localBlobUrl = URL.createObjectURL(file)
    localObjectUrlRef.current = localBlobUrl
    setPreview(localBlobUrl)

    setIsUploadingLocal(true)
    updateNodeData(id, {
      videoBlobUrl: localBlobUrl,
      output: localBlobUrl,
      fileName: file.name,
      isUploading: true,
      uploadError: '',
    })

    try {
      const response = await uploadToR2(file, workflowId, id, file.name)

      if (response.success && response.url) {
        const videoUrl = response.url
        setPreview(videoUrl)
        updateNodeData(id, {
          videoUrl,
          videoBlobUrl: localBlobUrl,
          output: videoUrl,
          assetPath: videoUrl,
          fileName: file.name,
          isUploading: false,
          uploadError: '',
        })
      } else {
        updateNodeData(id, {
          videoUrl: localBlobUrl,
          videoBlobUrl: localBlobUrl,
          output: localBlobUrl,
          assetPath: localBlobUrl,
          isUploading: false,
          uploadError: response.error || 'Upload failed',
        })
      }
    } catch {
      updateNodeData(id, {
        videoUrl: localBlobUrl,
        videoBlobUrl: localBlobUrl,
        output: localBlobUrl,
        assetPath: localBlobUrl,
        isUploading: false,
        uploadError: 'Upload failed',
      })
    } finally {
      setIsUploadingLocal(false)
    }
  }

  const handleRemoveVideo = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current)
      localObjectUrlRef.current = null
    }
    setPreview('')
    updateNodeData(id, {
      videoUrl: '',
      videoBlobUrl: '',
      output: '',
      assetPath: '',
      fileName: '',
      playheadTime: 0,
      videoDurationSeconds: 0,
      videoFps: 24,
      videoFrameIndex: 0,
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
        className={`relative min-w-[280px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
          }`}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Video className="w-4 h-4 text-violet-500" />
              </div>
              <h3 className="font-semibold text-sm">Video Upload</h3>
            </div>
            <NodeContextMenu nodeId={id} type="dropdown" asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </NodeContextMenu>
          </div>

          <div className="space-y-3">
            <div className="relative">
              {isUploading ? (
                <div className="h-40 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-md bg-muted/20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Uploading video...</span>
                </div>
              ) : preview ? (
                <div className="relative group/video">
                  <video
                    src={preview}
                    controls
                    className="w-full h-40 object-contain rounded-md border border-border bg-black"
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget
                      const duration = Number.isFinite(video.duration) ? video.duration : 0
                      updateNodeData(id, {
                        playheadTime: 0,
                        videoDurationSeconds: duration,
                        videoFps: 24,
                        videoFrameIndex: 0,
                      })
                    }}
                    onTimeUpdate={(event) => {
                      const video = event.currentTarget
                      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
                      const duration = Number.isFinite(video.duration) ? video.duration : 0
                      const fps = 24
                      updateNodeData(id, {
                        playheadTime: currentTime,
                        videoDurationSeconds: duration,
                        videoFps: fps,
                        videoFrameIndex: Math.max(0, Math.floor(currentTime * fps)),
                      })
                    }}
                    onSeeked={(event) => {
                      const video = event.currentTarget
                      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
                      const duration = Number.isFinite(video.duration) ? video.duration : 0
                      const fps = 24
                      updateNodeData(id, {
                        playheadTime: currentTime,
                        videoDurationSeconds: duration,
                        videoFps: fps,
                        videoFrameIndex: Math.max(0, Math.floor(currentTime * fps)),
                      })
                    }}
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/video:opacity-100 transition-opacity nodrag"
                    onClick={handleRemoveVideo}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  className="h-40 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-all nodrag"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center px-4">
                    Upload a video (max 200MB)
                  </p>
                </div>
              )}

              {uploadError && (
                <p className="mt-2 text-xs text-destructive">{uploadError}</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        <div
          className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-violet-300"
          style={{ top: '50%' }}
        >
          Video
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={OUTPUT_HANDLE_IDS.video}
          className="!w-3 !h-3 !border-2 !bg-violet-400 !border-violet-200"
        />
      </Card>
    </NodeContextMenu>
  )
})

VideoNode.displayName = 'VideoNode'

export const VideoUploadNode = VideoNode

export const VideoNodeProperties = () => {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload a video file up to 200MB to provide a video output handle for other nodes.
      </p>
    </div>
  )
}

export const VideoUploadProperties = VideoNodeProperties
