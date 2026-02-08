
import { HandleMeta, OUTPUT_HANDLE_IDS } from './models';

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
        name: 'Text Input',
        title: 'Text Input',
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
    }
];
