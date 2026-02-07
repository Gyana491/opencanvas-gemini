import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'
import prisma from '@/lib/prisma'
import { sendOTPEmail, sendResetPasswordEmail } from '@/lib/email/ses'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
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
  trustedOrigins: ['http://localhost:3000', 'https://opencanvas.gyana.dev', 'https://opencanvas-gemini.vercel.app'],
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