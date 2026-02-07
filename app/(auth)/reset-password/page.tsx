"use client"

import { useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, ArrowLeftIcon, CheckCircle2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { authClient } from "@/lib/auth-client"

const resetSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
})

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4">Loading...</div>}>
            <ResetPasswordContent />
        </Suspense>
    )
}

function ResetPasswordContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const token = searchParams.get("token")
    const error = searchParams.get("error")

    const [isSuccess, setIsSuccess] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const form = useForm<z.infer<typeof resetSchema>>({
        resolver: zodResolver(resetSchema),
        defaultValues: {
            password: "",
            confirmPassword: "",
        },
    })

    async function onSubmit(values: z.infer<typeof resetSchema>) {
        if (!token) {
            toast.error("Missing reset token")
            return
        }

        setIsLoading(true)

        try {
            await authClient.resetPassword({
                newPassword: values.password,
                token,
            }, {
                onSuccess: () => {
                    setIsSuccess(true)
                    toast.success("Password reset successfully!")
                },
                onError: (ctx) => {
                    toast.error(ctx.error.message)
                }
            })
        } catch (error: any) {
            toast.error("Failed to reset password", {
                description: error?.message || "Please try again",
            })
        } finally {
            setIsLoading(false)
        }
    }

    if (isSuccess) {
        return (
            <Card className="w-full">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
                            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-center">Password Reset Complete</CardTitle>
                    <CardDescription className="text-center">
                        Your password has been successfully updated.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex justify-center">
                    <Link href="/login">
                        <Button className="w-full sm:w-auto">Sign In with New Password</Button>
                    </Link>
                </CardFooter>
            </Card>
        )
    }

    if (error === "INVALID_TOKEN" || !token) {
        return (
            <Card className="w-full border-destructive/50">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
                            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-500" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-center">Invalid Link</CardTitle>
                    <CardDescription className="text-center">
                        This password reset link is invalid or has expired.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="flex justify-center">
                    <Link href="/forgot-password">
                        <Button variant="outline">Request New Link</Button>
                    </Link>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
                <CardDescription>
                    Enter your new password below.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Password</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="Enter new password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm Password</FormLabel>
                                    <FormControl>
                                        <Input type="password" placeholder="Confirm new password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                "Reset Password"
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="flex justify-center">
                <Link href="/login" className="flex items-center text-sm text-muted-foreground hover:text-neutral-900 dark:hover:text-neutral-50">
                    <ArrowLeftIcon className="mr-2 h-4 w-4" />
                    Back to Sign In
                </Link>
            </CardFooter>
        </Card>
    )
}
