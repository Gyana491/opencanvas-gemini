
export interface HandleMeta {
    id: string;
    label: string;
    type: 'text' | 'image' | 'video';
    required?: boolean;
    allowedSourceIds?: string[];
}

export interface Model {
    id: string;
    providerId: string;
    name: string;
    title: string;
    description: string;
    type: 'image' | 'video' | 'text' | 'chat';
    badge?: string;
    features?: string[];
    inputs?: HandleMeta[];
    outputs?: HandleMeta[];
}

export const OUTPUT_HANDLE_IDS = {
    text: 'textOutput',
    image: 'imageOutput',
    video: 'videoOutput',
};

export const TOOL_OUTPUT_HANDLE_IDS = {
    painterResult: 'painterResultOutput',
    painterMask: 'painterMaskOutput',
};

export const MODELS: Model[] = [
    {
        id: 'gemini-2.5-flash-image',
        providerId: 'google',
        name: 'gemini-2.5-flash-image',
        title: 'Nano Banana',
        description: 'Fast and efficient with great quality',
        type: 'image',
        features: ['Optimized for speed', 'Great for most tasks', 'Cost-effective'],
        inputs: [
            {
                id: 'prompt',
                label: 'Prompt',
                type: 'text',
                required: true,
                allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
            },
        ],
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
            },
        ],
    },
    {
        id: 'gemini-3-pro-image-preview',
        providerId: 'google',
        name: 'gemini-3-pro-image-preview',
        title: 'Nano Banana Pro',
        description: 'Advanced image generation with thinking',
        type: 'image',
        badge: 'New',
        features: ['Multimodal capabilities', 'Image and audio input', 'Fast responses'],
        inputs: [
            {
                id: 'prompt',
                label: 'Prompt',
                type: 'text',
                required: true,
                allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
            },
        ],
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
            },
        ],
    },
    {
        id: 'imagen-4.0-generate-001',
        providerId: 'google',
        name: 'imagen-4.0-generate-001',
        title: 'Imagen 4.0',
        description: 'AI image generation from text prompts',
        type: 'image',
        badge: 'New',
        features: ['High-quality images', 'Multiple aspect ratios', 'Fast generation'],
        inputs: [
            {
                id: 'prompt',
                label: 'Prompt',
                type: 'text',
                required: true,
                allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
            },
        ],
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
            },
        ],
    },
    {
        id: 'veo-3.1-generate-preview',
        providerId: 'google',
        name: 'veo-3.1-generate-preview',
        title: 'Veo 3.1',
        description: 'High-fidelity video generation',
        type: 'video',
        badge: 'New',
        features: ['High-quality video', 'Multiple resolutions', 'Native motion'],
        inputs: [
            {
                id: 'prompt',
                label: 'Prompt',
                type: 'text',
                required: true,
                allowedSourceIds: [OUTPUT_HANDLE_IDS.text],
            },
            {
                id: 'image',
                label: 'First Frame',
                type: 'image',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
            },
            {
                id: 'lastFrame',
                label: 'Last Frame',
                type: 'image',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
            },
            {
                id: 'video',
                label: 'Extend Video',
                type: 'video',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.video],
            },
        ],
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.video,
                label: 'Video',
                type: 'video',
            },
        ],
    }
];
