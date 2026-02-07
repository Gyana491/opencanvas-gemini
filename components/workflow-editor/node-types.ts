"use client"

import { ImagenNode } from "./nodes/models/imagen-node"
import { TextInputNode } from "./nodes/text-input-node"
import { ImageUploadNode } from "./nodes/image-upload-node"
import { NanoBananaNode } from "./nodes/models/nano-banana-node"
import { NanoBananaProNode } from "./nodes/models/nano-banana-pro-node"
import { Veo3Node } from "./nodes/models/veo-3-node"

export const workflowNodeTypes = {
  imagen: ImagenNode,
  textInput: TextInputNode,
  imageUpload: ImageUploadNode,
  nanoBanana: NanoBananaNode,
  nanoBananaPro: NanoBananaProNode,
  veo3: Veo3Node,
}
