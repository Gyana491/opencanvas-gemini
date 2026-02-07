'use client';

import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';

export function ProviderSettings() {


    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold mb-1">AI Providers</h2>
                <p className="text-sm text-muted-foreground">
                    Configure your AI provider API keys
                </p>
            </div>

            <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-600 font-semibold text-sm">G</span>
                        </div>
                        <h3 className="font-semibold">Google AI (Gemini)</h3>
                    </div>
                    <div className="flex items-center gap-1 text-green-600">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-medium">Active (Server-Side)</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Google AI is configured on the server. You can use Gemini and Imagen models in your workflows.
                    </p>
                </div>
            </Card>

            <div className="text-xs text-muted-foreground space-y-1">
                <p>• API keys are configured in the server environment</p>
                <p>• Keys are securely stored on the server</p>
            </div>
        </div>
    );
}
