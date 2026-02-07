export async function uploadToR2(
    file: Blob | File,
    workflowId: string,
    nodeId: string,
    fileName: string
): Promise<{ url: string; success: boolean; error?: string }> {
    const formData = new FormData()
    formData.append('file', file, fileName)
    formData.append('workflowId', workflowId)
    formData.append('nodeId', nodeId)

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Upload failed')
        }

        const data = await response.json()
        return { url: data.url, success: true }
    } catch (error) {
        console.error('Upload error:', error)
        return {
            url: '',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown upload error'
        }
    }
}
