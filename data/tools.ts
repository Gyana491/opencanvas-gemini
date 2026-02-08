
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
        id: 'google-search',
        name: 'Google Search',
        title: 'Google Search',
        description: 'Search the web for real-time information',
        category: 'search'
    }
];
