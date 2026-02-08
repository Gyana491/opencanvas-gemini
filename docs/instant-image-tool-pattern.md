# Instant Image Tool Pattern (Workflow Editor)

This doc explains the pattern used to make image-editing tool nodes render instantly and update in real time when:

- a source image is connected,
- controls change (slider/select),
- upstream image output changes.

Use this as the reference when adding new tools like sharpen, exposure, hue, denoise, etc.

## Why this pattern exists

The common failure mode is: preview does not render until a control changes.

The two root causes were:

1. Graph propagation effect only tracked node outputs, not edge wiring.
2. Image `onload` handler could be missed for cached images if `src` was assigned first.

Both are fixed now and should be preserved.

## Core data flow

1. Source node publishes an image URL/data URL in `output` or `imageOutput`.
2. Workflow propagation maps edge connections into target node `connectedImage` data.
3. Tool node watches `connectedImage` + control values and renders to canvas immediately.
4. Tool node writes processed output back into:
   - `output`
   - `imageOutput`
   - (optional) `getOutput` callback
5. Downstream nodes consume `output`/`imageOutput` and update instantly.

## Required contracts

### 1) Propagation must include edge changes

In `components/workflow-editor/index.tsx`, the propagation effect must re-run when connections change, not only when node values change.

Keep a graph signature like:

- edge signature (`source/target/handles`)
- node output signature (`output`, `imageUrl`, control params, etc.)

If you only track node output fields, newly connected edges may not trigger target updates.

### 2) Tool nodes must publish concrete image output

Tool nodes should set processed result as a concrete value:

- `output: <dataUrl>`
- `imageOutput: <dataUrl>`

Do not rely only on `getOutput()` function references. Functions are not stable change signals for propagation.

### 3) Canvas refs must exist before drawing

Preview and processing canvases should stay mounted. Hide preview canvas with CSS when disconnected instead of conditionally unmounting it.

This avoids first-render timing issues where refs are null during image load.

### 4) Image loading order for cached images

Always set handlers before assigning `src`:

1. `img.onload = render`
2. `img.onerror = handleError`
3. `img.src = connectedImage`
4. `if (img.complete) render()`

This guarantees immediate render for cached images too.

### 5) Protect against stale async callbacks

Inside render effect, use cancellation guards:

- `cancelled` in cleanup
- optional `hasRendered` guard

This avoids outdated loads writing stale output.

## Blur node reference implementation

Primary reference:

- `components/workflow-editor/nodes/tools/blur-node.tsx`

Key behavior in that file:

- reads `connectedImage`,
- renders into preview + hidden processing canvas,
- applies algorithm when controls change,
- writes `output`/`imageOutput` every successful render,
- clears output on disconnect/error.

## Graph propagation reference

Primary reference:

- `components/workflow-editor/index.tsx`

Key behavior in that file:

- tracks graph signature including edges,
- maps image edges to `connectedImage`,
- for blur source, prefers `sourceNode.data.output` first, then fallback to `getOutput()`.

## New tool checklist

When adding a new image tool node:

1. Accept input via `data.connectedImage`.
2. Keep preview + processing canvases mounted.
3. Render in `useEffect` with deps:
   - `connectedImage`
   - all control values used by the algorithm
4. Register `onload/onerror` before `img.src`.
5. Handle `img.complete`.
6. Set node data on success:
   - `output`
   - `imageOutput`
   - optional `getOutput`
7. Clear outputs when disconnected/error.
8. Ensure workflow propagation includes edge signature changes.

## About `0px` blur

`0px` blur should still render the original image.

Expected behavior:

- Preview shows source image unchanged.
- Output still updates and propagates.

So zero radius should never block rendering.

## Quick verification steps

1. Add Image node and Tool node.
2. Connect image output to tool image input.
3. Confirm preview appears immediately without touching controls.
4. Change slider/select and confirm preview updates instantly.
5. Connect tool output to a downstream model and confirm it receives updated image automatically.
6. Disconnect edge and confirm tool preview/output clears.

