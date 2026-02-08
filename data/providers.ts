
export interface Provider {
    id: string;
    name: string;
    description: string;
    icon?: string;
    color?: string;
    logo?: string;
}

export const PROVIDERS: Provider[] = [
    {
        id: 'google',
        name: 'Google AI',
        description: 'Access Gemini models for text generation, image analysis, and media creation',
        color: 'from-blue-500 to-purple-600',
        logo: "/assets/providers-logo/gemini.png"
    }
];
