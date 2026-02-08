export async function resolveVideoInput(input: string): Promise<{ mimeType: string, base64Data: string }> {
    if (!input) {
        throw new Error('Input video string is empty');
    }

    const match = input.match(/^data:(video\/[a-z0-9.+-]+);base64,/i);
    if (match) {
        return {
            mimeType: match[1],
            base64Data: input.split(',')[1],
        };
    }

    try {
        const response = await fetch(input);
        if (!response.ok) {
            throw new Error(`Failed to fetch video from URL: ${input}`);
        }
        const blob = await response.blob();
        const mimeType = blob.type || 'video/mp4';

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (!result) {
                    reject(new Error('Failed to convert blob to base64'));
                    return;
                }

                const base64Match = result.match(/^data:(video\/[a-z0-9.+-]+);base64,/i);
                const base64Data = result.split(',')[1];
                resolve({
                    mimeType: base64Match ? base64Match[1] : mimeType,
                    base64Data,
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error resolving video input:', error);
        throw error;
    }
}
