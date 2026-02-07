"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Input } from "@/components/ui/input"
import { RefreshCwIcon, ArrowLeftIcon } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"

export default function LoginOTPPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4">Loading...</div>}>
      <LoginOTPContent />
    </Suspense>
  )
}

function LoginOTPContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<"email" | "verify">("email")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // Get the redirect URL from query params, default to /dashboard
  const redirectTo = searchParams.get('from') || '/dashboard'

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })

      toast.success("OTP sent successfully", {
        description: `Check your email at ${email}`,
      })
      setStep("verify")
      setCountdown(60) // Start 60-second countdown
    } catch (error: any) {
      toast.error("Failed to send OTP", {
        description: error?.message || "Please try again",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    if (countdown > 0) return

    setLoading(true)
    try {
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })

      toast.success("OTP resent successfully")
      setCountdown(60)
      setOtp("") // Clear the OTP input
    } catch (error: any) {
      toast.error("Failed to resend OTP", {
        description: error?.message || "Please try again",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()

    if (otp.length !== 6) {
      toast.error("Please enter a 6-digit code")
      return
    }

    setLoading(true)

    try {
      await authClient.signIn.emailOtp({
        email,
        otp,
      })

      toast.success("Signed in successfully!")
      router.push(redirectTo)
    } catch (error: any) {
      toast.error("Verification failed", {
        description: error?.message || "Invalid or expired OTP",
      })
      setOtp("") // Clear the OTP input on error
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {step === "email" ? (
        <Card className="mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in with Email OTP</CardTitle>
            <CardDescription>
              Enter your email address and we'll send you a verification code.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSendOTP}>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
                <FieldDescription>
                  We'll send a 6-digit verification code to this email.
                </FieldDescription>
              </Field>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
                >
                  Sign in with password
                </a>
              </div>
            </CardFooter>
          </form>
        </Card>
      ) : (
        <Card className="mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle>Verify your login</CardTitle>
            <CardDescription>
              Enter the verification code we sent to your email address:{" "}
              <span className="font-medium">{email}</span>.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleVerifyOTP}>
            <CardContent className="justify-center">
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="otp-verification">
                    Verification code
                  </FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleResendOTP}
                    disabled={countdown > 0 || loading}
                  >
                    <RefreshCwIcon className="h-3 w-3" />
                    {countdown > 0 ? `Resend (${countdown}s)` : "Resend Code"}
                  </Button>
                </div>
                <div className="flex justify-center my-6">
                  <InputOTP
                    maxLength={6}
                    id="otp-verification"
                    value={otp}
                    onChange={setOtp}
                    required
                    disabled={loading}
                  >
                    <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator className="mx-2" />
                    <InputOTPGroup className="*:data-[slot=input-otp-slot]:h-12 *:data-[slot=input-otp-slot]:w-11 *:data-[slot=input-otp-slot]:text-xl">
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <FieldDescription className="my-4 text-center">
                  The code expires in 5 minutes. Having issues?<br/> {" "}
                  <a
                    href="#"
                    className="underline"
                    onClick={(e) => {
                      e.preventDefault()
                      setStep("email")
                      setOtp("")
                      setEmail("")
                    }}
                  >
                    Use a different email address
                  </a>
                  .
                </FieldDescription>
              </Field>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email")
                  setOtp("")
                }}
                disabled={loading}
              >
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Back to email
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Having trouble signing in?{" "}
                <a
                  href="/login"
                  className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
                >
                  Contact support
                </a>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  )
}
