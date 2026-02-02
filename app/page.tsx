import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, Cpu, Layers, Workflow, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-7xl mx-auto items-center px-4 md:px-6">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <Workflow className="h-6 w-6" />
              <span className="hidden font-bold sm:inline-block">
                OpenCanvas
              </span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link
                href="#features"
                className="transition-colors hover:text-foreground/80 text-foreground/60"
              >
                Features
              </Link>
              <Link
                href="#pricing"
                className="transition-colors hover:text-foreground/80 text-foreground/60"
              >
                Pricing
              </Link>
            </nav>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
            </div>
            <nav className="flex items-center space-x-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm">Get Started</Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <section className="w-full space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32">
          <div className="container mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 md:px-6 text-center">
            <Link
              href="/twitter"
              className="rounded-2xl bg-muted px-4 py-1.5 text-sm font-medium"
              target="_blank"
            >
              Follow along on Twitter
            </Link>
            <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              AI Workflow Orchestration for everyone
            </h1>
            <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-lg sm:leading-8">
              OpenCanvas is a node-based platform that enables you to create consistent, repeatable workflows using Google's Gemini AI models. Think of it as "n8n for AI".
            </p>
            <div className="space-x-4">
              <Link href="/sign-up">
                <Button size="lg" className="h-11 px-8">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="outline" size="lg" className="h-11 px-8">
                  Learn more
                </Button>
              </Link>
            </div>
          </div>
        </section>
        <section
          id="features"
          className="w-full space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24"
        >
          <div className="container mx-auto flex max-w-6xl flex-col items-center space-y-4 px-4 md:px-6 text-center">
            <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl font-bold">
              Features
            </h2>
            <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              Everything you need to build advanced AI workflows.
            </p>
          </div>
          <div className="mx-auto grid justify-center gap-4 w-full max-w-5xl px-4 md:px-6 sm:grid-cols-2 md:grid-cols-3">
            <Card>
              <CardHeader>
                <Layers className="h-10 w-10 mb-4" />
                <CardTitle>Node-Based Editor</CardTitle>
                <CardDescription>
                  Visual workflow design for Gemini AI operations with a drag-and-drop interface.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
               <Bot className="h-10 w-10 mb-4" />
                <CardTitle>Gemini Integration</CardTitle>
                <CardDescription>
                  Full support for Gemini Pro, Flash, and Vision models for text and multimodal processing.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Cpu className="h-10 w-10 mb-4" />
                <CardTitle>Batch Processing</CardTitle>
                <CardDescription>
                   Generate bulk content and analysis with maintained quality and consistency.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>
        <section className="w-full py-8 md:py-12 lg:py-24">
            <div className="container mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 px-4 md:px-6 text-center">
                <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl font-bold">
                    Powered by Gemini
                </h2>
                <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
                    Leverage the full power of Google's latest AI models
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-8 w-full max-w-5xl px-4 md:px-6">
                   <Card className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 border-none shadow-none">
                       <Zap className="h-8 w-8 mb-2 text-yellow-500"/>
                       <div className="font-bold">Gemini Flash</div>
                       <div className="text-sm text-muted-foreground">Fast & Efficient</div>
                   </Card>
                    <Card className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 border-none shadow-none">
                       <Bot className="h-8 w-8 mb-2 text-blue-500"/>
                       <div className="font-bold">Gemini Pro</div>
                       <div className="text-sm text-muted-foreground">Reasoning & Code</div>
                   </Card>
                   <Card className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 border-none shadow-none">
                       <Layers className="h-8 w-8 mb-2 text-purple-500"/>
                       <div className="font-bold">Gemini Ultra</div>
                       <div className="text-sm text-muted-foreground">Complex Tasks</div>
                   </Card>
                    <Card className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 border-none shadow-none">
                       <Workflow className="h-8 w-8 mb-2 text-green-500"/>
                       <div className="font-bold">Multimodal</div>
                       <div className="text-sm text-muted-foreground">Vision & Audio</div>
                   </Card>
                </div>
            </div>
        </section>
      </main>
      <footer className="w-full py-6 md:py-0 border-t">
        <div className="container mx-auto max-w-7xl flex flex-col items-center justify-between gap-4 px-4 md:px-8 md:h-24 md:flex-row">
            <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
              Built by <a href="#" className="font-medium underline underline-offset-4">OpenCanvas</a>. The source code is available on <a href="#" className="font-medium underline underline-offset-4">GitHub</a>.
            </p>
        </div>
      </footer>
    </div>
  );
}
