"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProviderSettings } from "@/components/sidebar/provider-settings"
import { Sparkles, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { MODELS } from "@/data/models"
import { TOOLS } from "@/data/tools"

export default function ProvidersPage() {
    return (
        <div className="flex-1 space-y-6 max-w-4xl">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">AI Providers</h2>
                <p className="text-muted-foreground mt-2">
                    Configure your AI provider API keys to enable AI-powered nodes in your workflows
                </p>
            </div>

            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>API Keys are stored locally</AlertTitle>
                <AlertDescription>
                    Your API keys are stored securely in your browser's local storage and are never sent to our servers.
                    They are only used to make direct requests to the AI provider APIs.
                </AlertDescription>
            </Alert>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <CardTitle>Google AI</CardTitle>
                                <CardDescription>
                                    Access Gemini models for text generation and analysis
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ProviderSettings />
                    </CardContent>
                </Card>

                {/* Placeholder for future providers */}
                <Card className="border-dashed">
                    <CardHeader>
                        <CardTitle className="text-muted-foreground">More providers coming soon</CardTitle>
                        <CardDescription>
                            We're working on adding support for OpenAI, Anthropic, and other AI providers
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Available Models</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {MODELS.filter(m => m.providerId === 'google').map((model) => (
                        <Card key={model.id}>
                            <CardHeader>
                                <CardTitle className="text-base">{model.title}</CardTitle>
                                <CardDescription>
                                    {model.description}
                                </CardDescription>
                            </CardHeader>
                            {model.features && model.features.length > 0 && (
                                <CardContent className="text-sm text-muted-foreground">
                                    <ul className="list-disc list-inside space-y-1">
                                        {model.features.map((feature: string, i: number) => (
                                            <li key={i}>{feature}</li>
                                        ))}
                                    </ul>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Available Tools</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TOOLS.map((tool: any) => (
                        <Card key={tool.id}>
                            <CardHeader>
                                <CardTitle className="text-base">{tool.title}</CardTitle>
                                <CardDescription>
                                    {tool.description}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
