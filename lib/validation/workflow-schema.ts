import { z } from 'zod';

/**
 * Zod schemas for workflow import/export validation
 * Ensures runtime type safety and provides detailed error messages
 */

// XYFlow Position schema
const positionSchema = z.object({
    x: z.number(),
    y: z.number(),
});

// XYFlow Viewport schema
export const viewportSchema = z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().min(0.1).max(10),
}).default({ x: 0, y: 0, zoom: 1 });

// Handle metadata schema
const handleMetaSchema = z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['text', 'image', 'video', 'audio']),
    required: z.boolean().optional(),
    allowedSourceIds: z.array(z.string()).optional(),
});

// Node data schema - flexible to accommodate different node types
const nodeDataSchema = z.object({
    label: z.string().optional(),
    inputs: z.array(handleMetaSchema).optional(),
    outputs: z.array(handleMetaSchema).optional(),
    // Media URLs
    imageUrl: z.string().optional(),
    assetPath: z.string().optional(),
    videoUrl: z.string().optional(),
    audioUrl: z.string().optional(),
    output: z.string().optional(),
    fileName: z.string().optional(),
    // Allow other properties
}).passthrough(); // Allow additional properties not explicitly defined

// Node schema
export const nodeSchema = z.object({
    id: z.string().min(1, 'Node ID is required'),
    type: z.string().min(1, 'Node type is required'),
    position: positionSchema,
    data: nodeDataSchema.optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    selected: z.boolean().optional(),
    dragging: z.boolean().optional(),
    // Allow other XYFlow properties
}).passthrough();

// Edge schema
export const edgeSchema = z.object({
    id: z.string().min(1, 'Edge ID is required'),
    source: z.string().min(1, 'Edge source is required'),
    target: z.string().min(1, 'Edge target is required'),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    type: z.string().optional(),
    animated: z.boolean().optional(),
    style: z.record(z.string(), z.any()).optional(),
    markerEnd: z.any().optional(),
    markerStart: z.any().optional(),
    // Allow other XYFlow properties
}).passthrough();

// Main workflow schema
export const workflowSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Workflow name is required').max(255, 'Workflow name is too long'),
    nodes: z.array(nodeSchema).min(0, 'Nodes array is required'),
    edges: z.array(edgeSchema).min(0, 'Edges array is required'),
    viewport: viewportSchema.optional(),
    exportedAt: z.string().datetime().optional(),
    // Allow additional metadata
}).passthrough();

// Type inference from schemas
export type WorkflowData = z.infer<typeof workflowSchema>;
export type NodeData = z.infer<typeof nodeSchema>;
export type EdgeData = z.infer<typeof edgeSchema>;
export type ViewportData = z.infer<typeof viewportSchema>;

/**
 * Validates workflow data and returns parsed result with type safety
 * @throws {z.ZodError} if validation fails
 */
export function validateWorkflow(data: unknown): WorkflowData {
    return workflowSchema.parse(data);
}

/**
 * Safely validates workflow data and returns result with error details
 */
export function safeValidateWorkflow(data: unknown): {
    success: true;
    data: WorkflowData;
} | {
    success: false;
    error: string;
    details: string[];
} {
    const result = workflowSchema.safeParse(data);
    
    if (result.success) {
        return {
            success: true,
            data: result.data,
        };
    }
    
    // Format Zod errors into user-friendly messages
    const errorMessages = result.error.issues.map((err: any) => {
        const path = err.path.join('.');
        return `${path ? `${path}: ` : ''}${err.message}`;
    });
    
    return {
        success: false,
        error: 'Invalid workflow structure',
        details: errorMessages,
    };
}

/**
 * Validates that a workflow has at least some content
 */
export function validateWorkflowHasContent(workflow: WorkflowData): {
    valid: boolean;
    message?: string;
} {
    if (workflow.nodes.length === 0 && workflow.edges.length === 0) {
        return {
            valid: false,
            message: 'Workflow is empty - must contain at least one node or edge',
        };
    }
    
    return { valid: true };
}

/**
 * Sanitizes workflow data before export to ensure clean JSON
 */
export function sanitizeWorkflowForExport(workflow: WorkflowData): WorkflowData {
    return {
        ...workflow,
        // Remove any temporary UI state
        nodes: workflow.nodes.map(node => ({
            ...node,
            selected: false,
            dragging: false,
        })),
        exportedAt: new Date().toISOString(),
    };
}
