/**
 * AWS SES Credential Verification Script
 * 
 * This script verifies your AWS SES credentials and configuration
 * before attempting to send emails.
 * 
 * Usage: npx tsx scripts/verify-ses-credentials.ts
 */

import { SESClient, VerifyEmailIdentityCommand, ListVerifiedEmailAddressesCommand, GetSendQuotaCommand } from '@aws-sdk/client-ses'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function verifySESCredentials() {
  console.log('🔍 Verifying AWS SES Credentials...\n')

  // Check environment variables
  const region = process.env.AWS_SES_REGION
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY
  const fromEmail = process.env.AWS_SES_FROM_EMAIL

  console.log('📋 Environment Variables:')
  console.log(`   AWS_SES_REGION: ${region || '❌ NOT SET'}`)
  console.log(`   AWS_SES_ACCESS_KEY_ID: ${accessKeyId ? `${accessKeyId.substring(0, 8)}... (${accessKeyId.length} chars)` : '❌ NOT SET'}`)
  console.log(`   AWS_SES_SECRET_ACCESS_KEY: ${secretAccessKey ? `${'*'.repeat(8)}... (${secretAccessKey.length} chars)` : '❌ NOT SET'}`)
  console.log(`   AWS_SES_FROM_EMAIL: ${fromEmail || '❌ NOT SET'}\n`)

  if (!region || !accessKeyId || !secretAccessKey || !fromEmail) {
    console.error('❌ Missing required environment variables!')
    process.exit(1)
  }

  // Validate Access Key ID format
  if (!accessKeyId.startsWith('AKIA')) {
    console.warn('⚠️  Warning: Access Key ID should start with "AKIA" for IAM users')
  }

  // Trim credentials
  const trimmedAccessKeyId = accessKeyId.trim()
  const trimmedSecretAccessKey = secretAccessKey.trim()

  console.log('🔐 Credential Details:')
  console.log(`   Access Key ID Format: ${trimmedAccessKeyId.startsWith('AKIA') ? '✅ Valid' : '⚠️  Unusual'}`)
  console.log(`   Access Key ID Length: ${trimmedAccessKeyId.length} chars ${trimmedAccessKeyId.length === 20 ? '✅' : '⚠️'}`)
  console.log(`   Secret Key Length: ${trimmedSecretAccessKey.length} chars ${trimmedSecretAccessKey.length === 40 ? '✅' : '⚠️'}`)
  console.log(`   Secret Key has special chars: ${/[+/=]/.test(trimmedSecretAccessKey) ? 'Yes (normal)' : 'No'}\n`)

  // Create SES client
  console.log('🔌 Initializing SES client...')
  const sesClient = new SESClient({
    region,
    credentials: {
      accessKeyId: trimmedAccessKeyId,
      secretAccessKey: trimmedSecretAccessKey,
    },
  })
  console.log('✅ SES client created\n')

  // Test 1: Get Send Quota
  console.log('📊 Test 1: Fetching Send Quota...')
  try {
    const quotaCommand = new GetSendQuotaCommand({})
    const quotaResponse = await sesClient.send(quotaCommand)
    
    console.log('✅ Send Quota Retrieved:')
    console.log(`   Max 24 Hour Send: ${quotaResponse.Max24HourSend}`)
    console.log(`   Sent Last 24 Hours: ${quotaResponse.SentLast24Hours}`)
    console.log(`   Max Send Rate: ${quotaResponse.MaxSendRate} emails/second\n`)
  } catch (error: any) {
    console.error('❌ Failed to get send quota:')
    console.error(`   Error: ${error.message}`)
    
    if (error.name === 'InvalidClientTokenId') {
      console.error('\n   This usually means:')
      console.error('   - The AWS Access Key ID is incorrect')
      console.error('   - The Access Key ID has been deleted or deactivated')
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.error('\n   This usually means:')
      console.error('   - The AWS Secret Access Key is incorrect')
      console.error('   - There might be whitespace in your .env file')
    } else if (error.message.includes('Resolved credential object is not valid')) {
      console.error('\n   This usually means:')
      console.error('   - The credentials format is invalid')
      console.error('   - The credentials contain unexpected characters')
      console.error('   - The .env file is not being loaded correctly')
    }
    
    console.error('\n   Please verify your credentials in the AWS IAM Console:')
    console.error('   https://console.aws.amazon.com/iam/home#/security_credentials\n')
    process.exit(1)
  }

  // Test 2: List Verified Email Addresses
  console.log('📧 Test 2: Listing Verified Email Addresses...')
  try {
    const listCommand = new ListVerifiedEmailAddressesCommand({})
    const listResponse = await sesClient.send(listCommand)
    
    if (listResponse.VerifiedEmailAddresses && listResponse.VerifiedEmailAddresses.length > 0) {
      console.log('✅ Verified Email Addresses:')
      listResponse.VerifiedEmailAddresses.forEach(email => {
        console.log(`   - ${email} ${email === fromEmail ? '✅ (matches FROM email)' : ''}`)
      })
    } else {
      console.log('⚠️  No verified email addresses found!')
      console.log('   You need to verify at least your sender email in AWS SES Console.')
    }
    console.log()
  } catch (error: any) {
    console.error('❌ Failed to list verified emails:')
    console.error(`   Error: ${error.message}\n`)
  }

  // Check if FROM email is verified
  console.log('🔍 Checking Sender Email Configuration...')
  try {
    const listCommand = new ListVerifiedEmailAddressesCommand({})
    const listResponse = await sesClient.send(listCommand)
    
    if (listResponse.VerifiedEmailAddresses?.includes(fromEmail)) {
      console.log(`✅ Sender email "${fromEmail}" is verified!\n`)
    } else {
      console.warn(`⚠️  Sender email "${fromEmail}" is NOT verified!`)
      console.warn('   You need to verify this email in AWS SES Console before sending.')
      console.warn('   Go to: https://console.aws.amazon.com/ses/home?region=' + region + '#/verified-identities\n')
    }
  } catch (error: any) {
    console.error(`❌ Could not verify sender email: ${error.message}\n`)
  }

  // Summary
  console.log('═══════════════════════════════════════')
  console.log('🎉 Credential Verification Complete!')
  console.log('═══════════════════════════════════════\n')
  console.log('✅ Your AWS credentials are valid!')
  console.log('✅ You have access to AWS SES\n')
  console.log('Next steps:')
  console.log('1. Make sure your sender email is verified')
  console.log('2. If in sandbox mode, verify recipient emails too')
  console.log('3. Run the test email script: npx tsx scripts/test-ses-email.ts\n')
}

// Run verification
verifySESCredentials().catch(error => {
  console.error('💥 Unexpected error:', error)
  process.exit(1)
})
