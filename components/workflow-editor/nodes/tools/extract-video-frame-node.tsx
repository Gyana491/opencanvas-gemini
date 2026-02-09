"use client"

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { MoreVertical, Pause, Play, Volume2 } from 'lucide-react'
import { OUTPUT_HANDLE_IDS } from '@/data/models'
import { NodeContextMenu } from '../../node-context-menu'

const DEFAULT_FPS = 24

const getStringField = (value: unknown): string => (typeof value === 'string' ? value : '')
const getNumberField = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const formatClock = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

const formatTimecode = (seconds: number, fps: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00'
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS
  const wholeSeconds = Math.floor(seconds)
  const frames = Math.floor((seconds - wholeSeconds) * safeFps)
  const mm = Math.floor(wholeSeconds / 60)
  const ss = wholeSeconds % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

export const ExtractVideoFrameNode = memo(({ data, selected, id }: NodeProps) => {
  const { updateNodeData } = useReactFlow()
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameCanvasRef = useRef<HTMLCanvasElement>(null)
  const outputObjectUrlRef = useRef<string | null>(null)
  const resolvedVideoObjectUrlRef = useRef<string | null>(null)
  const pendingSeekTimeRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState('')

  const connectedVideo = getStringField(data?.connectedVideo)
  const connectedVideoBlob = getStringField(data?.connectedVideoBlob)
  const connectedPlayheadTime = getNumberField(data?.connectedVideoCurrentTime, 0)
  const currentTime = getNumberField(data?.currentTime, 0)
  const duration = getNumberField(
    data?.durationSeconds,
    getNumberField(data?.connectedVideoDuration, 0)
  )
  const fps = getNumberField(
    data?.fps,
    getNumberField(data?.connectedVideoFps, DEFAULT_FPS)
  )
  const output = getStringField(data?.output)
  const frameIndex = getNumberField(data?.frameIndex, 0)
  const width = getNumberField(data?.videoWidth, 0)
  const height = getNumberField(data?.videoHeight, 0)

  const hasConnectedVideo = connectedVideoBlob.length > 0 || connectedVideo.length > 0
  const hasVideo = resolvedVideoSrc.length > 0
  const hasActiveConnectedTime = Number.isFinite(connectedPlayheadTime) && connectedPlayheadTime > 0
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeCurrentTime = clamp(currentTime, 0, safeDuration || 0)

  const dimensionText = width > 0 && height > 0 ? `${width}x${height}` : '--x--'
  const durationText = safeDuration > 0 ? `${safeDuration.toFixed(2)}s` : '--.--s'
  const fpsText = `${fps.toFixed(2)} fps`
  const metadata = `${dimensionText} | ${durationText} | ${fpsText}`

  const revokeOutput = useCallback(() => {
    if (outputObjectUrlRef.current) {
      URL.revokeObjectURL(outputObjectUrlRef.current)
      outputObjectUrlRef.current = null
    }
  }, [])

  const extractFrameAtCurrentTime = () => {
    const video = videoRef.current
    const canvas = frameCanvasRef.current
    if (!video || !canvas) return
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob((blob) => {
      if (!blob) return

      revokeOutput()
      const frameUrl = URL.createObjectURL(blob)
      outputObjectUrlRef.current = frameUrl

      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
      const nextFrameIndex = Math.max(0, Math.floor(time * fps))
      const nextTimecode = formatTimecode(time, fps)

      updateNodeData(id, {
        output: frameUrl,
        imageOutput: frameUrl,
        currentTime: time,
        durationSeconds: nextDuration,
        frameIndex: nextFrameIndex,
        timecode: nextTimecode,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        fps,
      })
    }, 'image/png')
  }

  const syncPlaybackMetadata = () => {
    const video = videoRef.current
    if (!video) return
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
    const time = Number.isFinite(video.currentTime) ? video.currentTime : 0
    updateNodeData(id, {
      currentTime: time,
      durationSeconds: nextDuration,
      frameIndex: Math.max(0, Math.floor(time * fps)),
      timecode: formatTimecode(time, fps),
      videoWidth: video.videoWidth || 0,
      videoHeight: video.videoHeight || 0,
      fps,
    })
  }

  const handleSeek = (nextTime: number) => {
    const video = videoRef.current
    if (!video) return
    const clampedTime = clamp(nextTime, 0, Number.isFinite(video.duration) ? video.duration : nextTime)
    video.currentTime = clampedTime
    updateNodeData(id, { currentTime: clampedTime })
  }

  const handleTogglePlayback = async () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      try {
        await video.play()
        setIsPlaying(true)
      } catch {
        setIsPlaying(false)
      }
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  useEffect(() => {
    return () => {
      revokeOutput()
      if (resolvedVideoObjectUrlRef.current) {
        URL.revokeObjectURL(resolvedVideoObjectUrlRef.current)
        resolvedVideoObjectUrlRef.current = null
      }
    }
  }, [revokeOutput])

  useEffect(() => {
    if (!hasConnectedVideo) {
      revokeOutput()
      updateNodeData(id, {
        output: '',
        imageOutput: '',
        currentTime: 0,
        durationSeconds: 0,
        frameIndex: 0,
        timecode: '00:00:00',
        videoWidth: 0,
        videoHeight: 0,
      })
    }
  }, [hasConnectedVideo, id, revokeOutput, updateNodeData])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    let didStartFetch = false

    if (resolvedVideoObjectUrlRef.current) {
      URL.revokeObjectURL(resolvedVideoObjectUrlRef.current)
      resolvedVideoObjectUrlRef.current = null
    }

    const blobCandidate = connectedVideoBlob || (connectedVideo.startsWith('blob:') ? connectedVideo : '')
    if (blobCandidate) {
      setResolvedVideoSrc(blobCandidate)
      return
    }

    if (!connectedVideo) {
      setResolvedVideoSrc('')
      return
    }

    const resolveRemoteToBlob = async () => {
      try {
        didStartFetch = true
        const response = await fetch(connectedVideo, { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to fetch connected video')
        const blob = await response.blob()
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        resolvedVideoObjectUrlRef.current = objectUrl
        setResolvedVideoSrc(objectUrl)
      } catch {
        if (cancelled) return
        setResolvedVideoSrc(connectedVideo)
      }
    }

    void resolveRemoteToBlob()

    return () => {
      cancelled = true
      if (didStartFetch && !controller.signal.aborted) {
        controller.abort('cleanup')
      }
    }
  }, [connectedVideoBlob, connectedVideo])

  useEffect(() => {
    pendingSeekTimeRef.current = hasActiveConnectedTime ? connectedPlayheadTime : 0
  }, [connectedPlayheadTime, hasActiveConnectedTime])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !hasVideo) return
    const fallbackMax = Number.isFinite(connectedPlayheadTime) ? connectedPlayheadTime : 0
    const desiredTime = clamp(
      pendingSeekTimeRef.current,
      0,
      Number.isFinite(video.duration) ? video.duration : fallbackMax
    )
    if (Math.abs(video.currentTime - desiredTime) > 0.05) {
      video.currentTime = desiredTime
    }
  }, [connectedPlayheadTime, hasVideo])

  return (
    <NodeContextMenu nodeId={id} type="context">
      <Card
        className={`relative w-[360px] bg-card border-2 transition-all group ${selected ? 'border-primary shadow-lg' : 'border-border'
          }`}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Extract Video Frame</h3>
            <NodeContextMenu nodeId={id} type="dropdown" asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </NodeContextMenu>
          </div>

          <div className="relative rounded-md border border-border bg-black/30 overflow-hidden">
            <video
              ref={videoRef}
              src={hasVideo ? resolvedVideoSrc : undefined}
              className="hidden"
              crossOrigin="anonymous"
              onLoadedMetadata={() => {
                const video = videoRef.current
                if (!video) return
                const targetTime = hasActiveConnectedTime
                  ? clamp(
                    pendingSeekTimeRef.current,
                    0,
                    Number.isFinite(video.duration) ? video.duration : pendingSeekTimeRef.current
                  )
                  : 0

                if (Math.abs(targetTime) > 0.001) {
                  video.currentTime = targetTime
                  return
                }

                video.currentTime = 0
                syncPlaybackMetadata()
                extractFrameAtCurrentTime()
              }}
              onTimeUpdate={() => {
                syncPlaybackMetadata()
                extractFrameAtCurrentTime()
              }}
              onSeeked={() => {
                syncPlaybackMetadata()
                extractFrameAtCurrentTime()
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <canvas ref={frameCanvasRef} className="hidden" />

            {output ? (
              <img
                src={output}
                alt="Extracted frame"
                className="w-full h-[220px] object-cover"
              />
            ) : (
              <div className="w-full h-[220px] flex items-center justify-center text-xs text-muted-foreground">
                {hasConnectedVideo ? 'Loading frame...' : 'Connect a video input'}
              </div>
            )}

            <div className="absolute left-2 bottom-2 text-[10px] text-white/85 font-mono bg-black/35 rounded px-1.5 py-0.5">
              {metadata}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleTogglePlayback}
              disabled={!hasVideo}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[86px]">
              {formatClock(safeCurrentTime)} / {formatClock(safeDuration)}
            </span>
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          </div>

          <Slider
            min={0}
            max={safeDuration > 0 ? safeDuration : 1}
            step={0.01}
            value={[safeCurrentTime]}
            disabled={!hasVideo || safeDuration <= 0}
            onValueChange={(value) => {
              const [next] = value
              if (typeof next === 'number' && Number.isFinite(next)) {
                handleSeek(next)
              }
            }}
          />

          <div className="pt-1 border-t border-border/60 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Frame</p>
              <Input value={String(frameIndex)} readOnly className="h-8 text-sm tabular-nums" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Timecode</p>
              <Input value={getStringField(data?.timecode) || formatTimecode(safeCurrentTime, fps)} readOnly className="h-8 text-sm tabular-nums" />
            </div>
          </div>
        </div>

        <div
          className="absolute left-0 -translate-x-full -translate-y-1/2 pr-3 text-[10px] font-bold tracking-tight uppercase text-rose-300"
          style={{ top: '50%' }}
        >
          Video
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="video"
          className="!w-3 !h-3 !border-2 !bg-rose-400 !border-rose-200"
        />

        <div
          className="absolute right-0 translate-x-full -translate-y-1/2 pl-3 text-[10px] font-bold tracking-tight uppercase text-emerald-300"
          style={{ top: '50%' }}
        >
          Frame
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

ExtractVideoFrameNode.displayName = 'ExtractVideoFrameNode'
