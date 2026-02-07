/**
 * Test script for AWS SES Email sending
 * 
 * This script helps you verify your AWS SES configuration before using it in production.
 * 
 * Usage:
 * 1. Make sure you have set up your .env file with AWS SES credentials:
 *    - AWS_SES_REGION
 *    - AWS_SES_ACCESS_KEY_ID
 *    - AWS_SES_SECRET_ACCESS_KEY
 *    - AWS_SES_FROM_EMAIL
 * 
 * 2. Update the TEST_EMAIL constant below with your email address
 * 
 * 3. Run the script:
 *    npx tsx scripts/test-ses-email.ts
 * 
 * 4. Check your email inbox for the test OTP email
 */

import { sendOTPEmail } from '../lib/email/ses'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// ⚠️ UPDATE THIS WITH YOUR TEST EMAIL ADDRESS
const TEST_EMAIL = 'gyanaranjanmohanta2004@gmail.com'

async function testSESEmail() {
  console.log('🧪 Testing AWS SES Email Configuration...\n')

  // Check if environment variables are set
  const requiredEnvVars = [
    'AWS_SES_REGION',
    'AWS_SES_ACCESS_KEY_ID',
    'AWS_SES_SECRET_ACCESS_KEY',
    'AWS_SES_FROM_EMAIL',
  ]

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    missingVars.forEach(varName => console.error(`   - ${varName}`))
    console.error('\nPlease add these to your .env file and try again.')
    process.exit(1)
  }

  console.log('✅ Environment variables configured')
  console.log(`📧 From Email: ${process.env.AWS_SES_FROM_EMAIL}`)
  console.log(`📫 To Email: ${TEST_EMAIL}`)
  console.log(`🌍 Region: ${process.env.AWS_SES_REGION}\n`)

  // Test all three email types
  const testCases: Array<{
    type: 'sign-in' | 'email-verification' | 'forget-password'
    description: string
  }> = [
    { type: 'sign-in', description: 'Sign-In OTP' },
    { type: 'email-verification', description: 'Email Verification OTP' },
    { type: 'forget-password', description: 'Password Reset OTP' },
  ]

  let successCount = 0
  let failureCount = 0

  for (const testCase of testCases) {
    try {
      console.log(`📨 Sending ${testCase.description} email...`)
      
      const result = await sendOTPEmail({
        to: TEST_EMAIL,
        otp: '123456',
        type: testCase.type,
      })

      if (result.success) {
        console.log(`✅ ${testCase.description} email sent successfully!`)
        console.log(`   Message ID: ${result.messageId}\n`)
        successCount++
      } else {
        console.error(`❌ ${testCase.description} email failed to send\n`)
        failureCount++
      }
    } catch (error) {
      console.error(`❌ Error sending ${testCase.description} email:`)
      console.error(`   ${error}\n`)
      failureCount++
    }

    // Wait a bit between sends to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n📊 Test Summary')
  console.log('═══════════════════════════════════════')
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failureCount}`)
  console.log('═══════════════════════════════════════\n')

  if (failureCount === 0) {
    console.log('🎉 All tests passed! Your AWS SES is configured correctly.')
    console.log('📬 Check your email inbox for the test OTP emails.\n')
    console.log('⚠️  Important Notes:')
    console.log('   - If in sandbox mode, make sure the recipient email is verified')
    console.log('   - Check spam folder if you don\'t see the emails')
    console.log('   - Request production access to send to any email address\n')
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.')
    console.log('\n🔍 Common Issues:')
    console.log('   1. AWS SES is in sandbox mode - verify recipient email in AWS Console')
    console.log('   2. Invalid AWS credentials - check your access key and secret')
    console.log('   3. Sender email not verified - verify it in AWS SES Console')
    console.log('   4. Insufficient permissions - ensure IAM user has SES sending permissions')
    console.log('   5. Region mismatch - ensure AWS_SES_REGION matches your SES setup\n')
  }
}

// Run the test
testSESEmail().catch(error => {
  console.error('💥 Unexpected error:', error)
  process.exit(1)
})
