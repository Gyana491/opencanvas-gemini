import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

interface SendOTPEmailParams {
  to: string
  otp: string
  type: 'sign-in' | 'email-verification' | 'forget-password'
}

// Lazy initialization of SES client to ensure env vars are loaded
let sesClient: SESClient | null = null

function getSESClient(): SESClient {
  if (sesClient) {
    return sesClient
  }

  const region = process.env.AWS_SES_REGION
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY

  // Validate credentials
  if (!region) {
    throw new Error('AWS_SES_REGION is not set in environment variables')
  }
  if (!accessKeyId) {
    throw new Error('AWS_SES_ACCESS_KEY_ID is not set in environment variables')
  }
  if (!secretAccessKey) {
    throw new Error('AWS_SES_SECRET_ACCESS_KEY is not set in environment variables')
  }

  // Trim credentials to remove any whitespace
  const trimmedAccessKeyId = accessKeyId.trim()
  const trimmedSecretAccessKey = secretAccessKey.trim()

  console.log('🔑 Initializing SES client with:', {
    region,
    accessKeyIdLength: trimmedAccessKeyId.length,
    accessKeyIdPrefix: trimmedAccessKeyId.substring(0, 8) + '...',
    secretAccessKeyLength: trimmedSecretAccessKey.length,
  })

  sesClient = new SESClient({
    region,
    credentials: {
      accessKeyId: trimmedAccessKeyId,
      secretAccessKey: trimmedSecretAccessKey,
    },
  })

  return sesClient
}

const getEmailTemplate = (otp: string, type: SendOTPEmailParams['type']) => {
  const templates = {
    'sign-in': {
      subject: 'Your Sign-In Code',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sign-In OTP</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px;">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 0 0 32px 0;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #000000; letter-spacing: -0.5px;">OpenCanvas</h1>
                      </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 500; color: #000000; letter-spacing: -0.3px;">Sign in to your account</h2>
                        <p style="margin: 0; font-size: 15px; line-height: 24px; color: #666666;">Use this verification code to complete your sign in:</p>
                      </td>
                    </tr>
                    <!-- OTP Code -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <div style="background-color: #f5f5f5; border: 1px solid #e5e5e5; padding: 24px; text-align: center;">
                          <p style="margin: 0; font-size: 32px; font-weight: 600; color: #000000; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
                        </div>
                      </td>
                    </tr>
                    <!-- Footer Info -->
                    <tr>
                      <td style="padding: 0 0 40px 0;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 20px; color: #999999;">This code expires in 5 minutes.</p>
                        <p style="margin: 0; font-size: 13px; line-height: 20px; color: #999999;">If you didn't request this, please ignore this email.</p>
                      </td>
                    </tr>
                    <!-- Divider -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <div style="height: 1px; background-color: #e5e5e5;"></div>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 0;">
                        <p style="margin: 0; font-size: 12px; color: #999999;">© ${new Date().getFullYear()} OpenCanvas. All rights reserved.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      text: `Your sign-in OTP code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    },
    'email-verification': {
      subject: 'Verify Your Email',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Verification</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px;">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 0 0 32px 0;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #000000; letter-spacing: -0.5px;">OpenCanvas</h1>
                      </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 500; color: #000000; letter-spacing: -0.3px;">Verify your email</h2>
                        <p style="margin: 0; font-size: 15px; line-height: 24px; color: #666666;">Welcome! Use this code to verify your email address:</p>
                      </td>
                    </tr>
                    <!-- OTP Code -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <div style="background-color: #f5f5f5; border: 1px solid #e5e5e5; padding: 24px; text-align: center;">
                          <p style="margin: 0; font-size: 32px; font-weight: 600; color: #000000; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
                        </div>
                      </td>
                    </tr>
                    <!-- Footer Info -->
                    <tr>
                      <td style="padding: 0 0 40px 0;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 20px; color: #999999;">This code expires in 5 minutes.</p>
                        <p style="margin: 0; font-size: 13px; line-height: 20px; color: #999999;">If you didn't create an account, please ignore this email.</p>
                      </td>
                    </tr>
                    <!-- Divider -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <div style="height: 1px; background-color: #e5e5e5;"></div>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 0;">
                        <p style="margin: 0; font-size: 12px; color: #999999;">© ${new Date().getFullYear()} OpenCanvas. All rights reserved.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      text: `Your email verification OTP code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you didn't create an account, please ignore this email.`,
    },
    'forget-password': {
      subject: 'Reset Your Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px;">
                    <!-- Header -->
                    <tr>
                      <td style="padding: 0 0 32px 0;">
                        <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #000000; letter-spacing: -0.5px;">OpenCanvas</h1>
                      </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 500; color: #000000; letter-spacing: -0.3px;">Reset your password</h2>
                        <p style="margin: 0; font-size: 15px; line-height: 24px; color: #666666;">We received a request to reset your password. Use this code to continue:</p>
                      </td>
                    </tr>
                    <!-- OTP Code -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <div style="background-color: #f5f5f5; border: 1px solid #e5e5e5; padding: 24px; text-align: center;">
                          <p style="margin: 0; font-size: 32px; font-weight: 600; color: #000000; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
                        </div>
                      </td>
                    </tr>
                    <!-- Footer Info -->
                    <tr>
                      <td style="padding: 0 0 40px 0;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 20px; color: #999999;">This code expires in 5 minutes.</p>
                        <p style="margin: 0; font-size: 13px; line-height: 20px; color: #999999; font-weight: 500;">If you didn't request this, please ignore this email.</p>
                      </td>
                    </tr>
                    <!-- Divider -->
                    <tr>
                      <td style="padding: 0 0 24px 0;">
                        <div style="height: 1px; background-color: #e5e5e5;"></div>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 0;">
                        <p style="margin: 0; font-size: 12px; color: #999999;">© ${new Date().getFullYear()} OpenCanvas. All rights reserved.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      text: `Your password reset OTP code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request a password reset, please ignore this email.`,
    },
  }

  return templates[type]
}

export async function sendOTPEmail({ to, otp, type }: SendOTPEmailParams) {
  const template = getEmailTemplate(otp, type)
  const fromEmail = process.env.AWS_SES_FROM_EMAIL

  if (!fromEmail) {
    throw new Error('AWS_SES_FROM_EMAIL is not set in environment variables')
  }

  const client = getSESClient()

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: template.subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: template.html,
          Charset: 'UTF-8',
        },
        Text: {
          Data: template.text,
          Charset: 'UTF-8',
        },
      },
    },
  })

  try {
    const response = await client.send(command)
    console.log('OTP email sent successfully:', response.MessageId)
    return { success: true, messageId: response.MessageId }
  } catch (error) {
    console.error('Error sending OTP email:', error)
    throw error
  }
}
