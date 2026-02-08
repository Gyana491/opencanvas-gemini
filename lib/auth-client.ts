import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"

const baseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    emailOTPClient()
  ]
})

export const { signIn, signUp, useSession } = authClient;
