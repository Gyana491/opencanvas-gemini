import JSZip from 'jszip';
import { Node } from '@xyflow/react';
import { 
    sanitizeWorkflowForExport, 
    safeValidateWorkflow,
    type WorkflowData 
} from '@/lib/validation/workflow-schema';

/**
 * Extracts all media URLs from workflow nodes
 */
export function extractMediaUrls(nodes: Node[]): Array<{ url: string; filename: string }> {
    const mediaFiles: Array<{ url: string; filename: string }> = [];
    const seenUrls = new Set<string>();

    nodes.forEach((node) => {
        const data = node.data;
        if (!data) return;

        // Check common properties where media URLs might be stored
        const urlFields = [
            'imageUrl',
            'assetPath',
            'videoUrl',
            'audioUrl',
            'output', // For generated media outputs
        ];

        urlFields.forEach((field) => {
            const value = data[field];
            if (typeof value === 'string' && value && isValidMediaUrl(value)) {
                if (!seenUrls.has(value)) {
                    seenUrls.add(value);
                    const fileName = typeof data.fileName === 'string' ? data.fileName : undefined;
                    mediaFiles.push({
                        url: value,
                        filename: extractFilenameFromUrl(value, fileName),
                    });
                }
            }
        });

        // Check if there's a fileName property that pairs with the URL
        // This helps maintain original file names
    });

    return mediaFiles;
}

/**
 * Checks if a string is a valid media URL
 */
function isValidMediaUrl(url: string): boolean {
    // Check for http/https URLs or data URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
        // Check if it looks like a media file
        const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', '.avi', '.mp3', '.wav', '.ogg'];
        const hasMediaExtension = mediaExtensions.some(ext => url.toLowerCase().includes(ext));
        
        // Also check for R2/cloudflare URLs or blob URLs
        const isCloudStorage = url.includes('cloudflare') || url.includes('r2.dev');
        
        return hasMediaExtension || isCloudStorage;
    }
    
    // Support data URLs for inline media
    if (url.startsWith('data:image/') || url.startsWith('data:video/') || url.startsWith('data:audio/')) {
        return true;
    }
    
    return false;
}

/**
 * Extracts or generates a filename from a URL
 */
function extractFilenameFromUrl(url: string, providedFileName?: string): string {
    // Use provided filename if available
    if (providedFileName && typeof providedFileName === 'string') {
        return providedFileName;
    }

    // For data URLs, generate a name based on the mime type
    if (url.startsWith('data:')) {
        const mimeMatch = url.match(/^data:([^;]+)/);
        if (mimeMatch) {
            const mime = mimeMatch[1];
            const ext = mime.split('/')[1] || 'bin';
            return `asset-${Date.now()}.${ext}`;
        }
        return `asset-${Date.now()}.bin`;
    }

    // Extract filename from URL
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const segments = pathname.split('/');
        const filename = segments[segments.length - 1];
        
        if (filename && filename.length > 0) {
            return filename;
        }
    } catch (e) {
        // Invalid URL, generate a name
    }

    // Fallback: generate a unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `asset-${timestamp}-${random}.bin`;
}

/**
 * Downloads a file from URL as a blob
 */
async function fetchAsBlob(url: string): Promise<Blob> {
    // For data URLs, convert directly to blob
    if (url.startsWith('data:')) {
        const response = await fetch(url);
        return response.blob();
    }

    // For HTTP URLs, fetch with CORS
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return response.blob();
}

/**
 * Creates and downloads a ZIP file containing the workflow and all media assets
 */
export async function exportWorkflowAsZip(
    workflowId: string,
    workflowName: string,
    nodes: Node[],
    edges: any[],
    viewport: any,
    onProgress?: (progress: number, message: string) => void
): Promise<void> {
    const zip = new JSZip();

    try {
        // 1. Create workflow JSON with validation
        onProgress?.(10, 'Preparing workflow data...');
        const workflowData = {
            id: workflowId,
            name: workflowName,
            nodes: nodes as any,
            edges: edges as any,
            viewport,
            exportedAt: new Date().toISOString(),
        };

        // Validate before export to catch any issues early
        const validation = safeValidateWorkflow(workflowData);
        if (!validation.success) {
            const errorMessage = `Failed to validate workflow before export:\n${validation.details.join('\n')}`;
            console.error(errorMessage);
            throw new Error('Workflow data validation failed. Cannot export invalid workflow.');
        }

        // Sanitize the workflow (remove UI state, etc.)
        const sanitizedData = sanitizeWorkflowForExport(validation.data);
        const workflowJson = JSON.stringify(sanitizedData, null, 2);
        zip.file(`opencanvas_workflow_${workflowId}.json`, workflowJson);

        // 2. Extract and download all media files
        onProgress?.(20, 'Extracting media files...');
        const mediaFiles = extractMediaUrls(nodes);

        if (mediaFiles.length === 0) {
            onProgress?.(90, 'No media files found...');
        } else {
            const assetsFolder = zip.folder('assets');
            if (!assetsFolder) {
                throw new Error('Failed to create assets folder');
            }

            // Download each media file
            for (let i = 0; i < mediaFiles.length; i++) {
                const { url, filename } = mediaFiles[i];
                const progress = 20 + ((i + 1) / mediaFiles.length) * 60;
                onProgress?.(progress, `Downloading ${filename}...`);

                try {
                    const blob = await fetchAsBlob(url);
                    assetsFolder.file(filename, blob);
                } catch (error) {
                    console.error(`Failed to download ${url}:`, error);
                    // Continue with other files even if one fails
                    onProgress?.(progress, `Failed to download ${filename}, skipping...`);
                }
            }
        }

        // 3. Generate the ZIP file
        onProgress?.(90, 'Creating ZIP file...');
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6,
            },
        });

        // 4. Download the ZIP file
        onProgress?.(95, 'Downloading ZIP...');
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `opencanvas_${workflowId}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        onProgress?.(100, 'Export complete!');
    } catch (error) {
        console.error('Export failed:', error);
        throw error;
    }
}
