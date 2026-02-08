
import { HandleMeta, OUTPUT_HANDLE_IDS, TOOL_OUTPUT_HANDLE_IDS } from './models';

export interface Tool {
    id: string;
    name: string;
    title: string;
    description: string;
    icon?: string;
    category: 'input' | 'search' | 'calculation' | 'media' | 'other';
    inputs?: HandleMeta[];
    outputs?: HandleMeta[];
}

export const TOOLS: Tool[] = [
    {
        id: 'textInput',
        name: 'Prompt',
        title: 'Prompt',
        description: 'Enter text or prompts',
        category: 'input',
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.text,
                label: 'Text',
                type: 'text',
            },
        ],
    },
    {
        id: 'imageUpload',
        name: 'Image Upload',
        title: 'Image Upload',
        description: 'Upload images',
        category: 'input',
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
            },
        ],
    },
    {
        id: 'blur',
        name: 'Blur',
        title: 'Blur',
        description: 'Apply blur effect to images',
        category: 'media',
        inputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
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
        id: 'colorGrading',
        name: 'Color Grading',
        title: 'Color Grading',
        description: 'Adjust RGB levels with per-channel min, gamma, and max',
        category: 'media',
        inputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
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
        id: 'crop',
        name: 'Crop',
        title: 'Crop',
        description: 'Crop images with aspect ratio and dimensions',
        category: 'media',
        inputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
            },
        ],
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
            },
        ],
    }
    ,
    {
        id: 'painter',
        name: 'Painter',
        title: 'Painter',
        description: 'Draw and erase on image with result and mask outputs',
        category: 'media',
        inputs: [
            {
                id: OUTPUT_HANDLE_IDS.image,
                label: 'Image',
                type: 'image',
                allowedSourceIds: [OUTPUT_HANDLE_IDS.image],
            },
        ],
        outputs: [
            {
                id: TOOL_OUTPUT_HANDLE_IDS.painterResult,
                label: 'Result',
                type: 'image',
            },
            {
                id: TOOL_OUTPUT_HANDLE_IDS.painterMask,
                label: 'Mask',
                type: 'image',
            },
        ],
    }
];
