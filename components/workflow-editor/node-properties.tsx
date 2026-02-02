"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { AlertCircle, X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

interface NodePropertiesProps {
  node: any
  onUpdateNode: (nodeId: string, data: any) => void
  isOpen: boolean
  onClose: () => void
}

export function NodeProperties({ node, onUpdateNode, isOpen, onClose }: NodePropertiesProps) {

  const handleDataChange = (field: string, value: any) => {
    onUpdateNode(node.id, { [field]: value })
  }

  return (
    <AnimatePresence>
      {isOpen && node && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="w-72 border-l bg-background absolute right-0 top-0 bottom-0 z-50 shadow-lg"
        >
          <ScrollArea className="h-full">
            <div className="px-3 py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Node Properties</h2>
                  <p className="text-xs text-muted-foreground">{node.data.label}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-6 w-6"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
          {node.type === 'geminiPro' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="systemPrompt" className="text-xs">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  placeholder="Enter system instructions..."
                  value={node.data.systemPrompt || ''}
                  onChange={(e) => handleDataChange('systemPrompt', e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="userPrompt" className="text-xs">User Prompt</Label>
                <Textarea
                  id="userPrompt"
                  placeholder="Enter user prompt..."
                  value={node.data.userPrompt || ''}
                  onChange={(e) => handleDataChange('userPrompt', e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="temperature" className="text-xs">Temperature</Label>
                  <span className="text-xs text-muted-foreground">
                    {node.data.temperature || 0.7}
                  </span>
                </div>
                <Slider
                  id="temperature"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[node.data.temperature || 0.7]}
                  onValueChange={(value) => handleDataChange('temperature', value[0])}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="maxTokens" className="text-xs">Max Tokens</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  value={node.data.maxTokens || 1000}
                  onChange={(e) => handleDataChange('maxTokens', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {node.type === 'geminiFlash' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="prompt" className="text-xs">Prompt</Label>
                <Textarea
                  id="prompt"
                  placeholder="Enter prompt..."
                  value={node.data.prompt || ''}
                  onChange={(e) => handleDataChange('prompt', e.target.value)}
                  rows={4}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="temperature" className="text-xs">Temperature</Label>
                  <span className="text-xs text-muted-foreground">
                    {node.data.temperature || 0.5}
                  </span>
                </div>
                <Slider
                  id="temperature"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[node.data.temperature || 0.5]}
                  onValueChange={(value) => handleDataChange('temperature', value[0])}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="maxTokens" className="text-xs">Max Tokens</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  value={node.data.maxTokens || 500}
                  onChange={(e) => handleDataChange('maxTokens', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {node.type === 'geminiVision' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="prompt" className="text-xs">Prompt</Label>
                <Textarea
                  id="prompt"
                  placeholder="What do you want to know about the image?"
                  value={node.data.prompt || ''}
                  onChange={(e) => handleDataChange('prompt', e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="imageUrl" className="text-xs">Image URL</Label>
                <Input
                  id="imageUrl"
                  placeholder="https://example.com/image.jpg"
                  value={node.data.imageUrl || ''}
                  onChange={(e) => handleDataChange('imageUrl', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
