
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
        id: 'stickyNote',
        name: 'Sticky Note',
        title: 'Sticky Note',
        description: 'A freeform note you can place anywhere on the canvas',
        category: 'input',
    },
    {
        id: 'imageDescriber',
        name: 'Image Describer',
        title: 'Image Describer',
        description: 'Generate text descriptions from one or more input images',
        category: 'media',
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.text,
                label: 'Text',
                type: 'text',
            },
        ],
    },
    {
        id: 'promptEnhancer',
        name: 'Prompt Enhancer',
        title: 'Prompt Enhancer',
        description: 'Enhance and refine prompts while preserving intent',
        category: 'other',
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
                id: OUTPUT_HANDLE_IDS.text,
                label: 'Enhanced Prompt',
                type: 'text',
            },
        ],
    },
    {
        id: 'promptConcatenator',
        name: 'Prompt Concatenator',
        title: 'Prompt Concatenator',
        description: 'Combine multiple text prompt inputs into one consolidated prompt',
        category: 'other',
        outputs: [
            {
                id: OUTPUT_HANDLE_IDS.text,
                label: 'Combined Prompt',
                type: 'text',
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
