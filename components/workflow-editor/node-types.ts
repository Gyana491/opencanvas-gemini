"use client"

import { Gemini25FlashImageNode } from "./nodes/models/gemini-2.5-flash-image"
import { TextInputNode } from "./nodes/text-input-node"
import { ImageUploadNode } from "./nodes/image-upload-node"
import { Gemini3ProImagePreviewNode } from "./nodes/models/gemini-3-pro-image-preview"
import { Imagen40Generate001Node } from "./nodes/models/imagen-4.0-generate-001"
import { Veo31GeneratePreviewNode } from "./nodes/models/veo-3.1-generate-preview"
import { BlurNode } from "./nodes/tools/blur-node"
import { ColorGradingNode } from "./nodes/tools/color-grading-node"
import { CropNode } from "./nodes/tools/crop-node"
import { PainterNode } from "./nodes/tools/painter-node"
import { StickyNoteNode } from "./nodes/sticky-note-node"

export const workflowNodeTypes = {
  "imagen-4.0-generate-001": Imagen40Generate001Node,
  textInput: TextInputNode,
  imageUpload: ImageUploadNode,
  "gemini-2.5-flash-image": Gemini25FlashImageNode,
  "gemini-3-pro-image-preview": Gemini3ProImagePreviewNode,
  "veo-3.1-generate-preview": Veo31GeneratePreviewNode,
  blur: BlurNode,
  colorGrading: ColorGradingNode,
  crop: CropNode,
  painter: PainterNode,
  stickyNote: StickyNoteNode,
}
