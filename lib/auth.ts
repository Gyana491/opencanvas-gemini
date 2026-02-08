import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'
import prisma from '@/lib/prisma'
import { sendOTPEmail, sendResetPasswordEmail } from '@/lib/email/ses'

const authBaseURL =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL
const secureCookiesFromEnv = process.env.BETTER_AUTH_USE_SECURE_COOKIES
const useSecureCookies =
  secureCookiesFromEnv !== undefined
    ? secureCookiesFromEnv === 'true'
    : process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL: authBaseURL,
  session: {
    // Keep users signed in across browser restarts.
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 24 hours
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendResetPasswordEmail({
          to: user.email,
          url,
        })
      } catch (error) {
        console.error('Failed to send reset password email:', error)
      }
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: [
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000',
    'https://opencanvas.gyana.dev',
    'https://opencanvas-gemini.vercel.app',
  ],
  advanced: {
    useSecureCookies,
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        try {
          await sendOTPEmail({
            to: email,
            otp,
            type,
          })
        } catch (error) {
          console.error('Failed to send OTP email:', error)
        }
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes
      sendVerificationOnSignUp: false,
      disableSignUp: false,
      allowedAttempts: 3,
      storeOTP: 'hashed', // Store hashed OTP for security
    }),
  ],
})
