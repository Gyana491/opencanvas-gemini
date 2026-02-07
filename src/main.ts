import prisma from '../lib/prisma'

async function main() {
  console.log('🚀 Performing CRUD operations with Neon + Prisma...')

  // Generate a unique ID and email for this test
  const userId = `user_${Date.now()}`
  const userEmail = `alice-${Date.now()}@example.com`

  // CREATE
  const newUser = await prisma.user.create({
    data: { 
      id: userId,
      name: 'Alice Johnson', 
      email: userEmail,
      emailVerified: false,
      image: 'https://example.com/alice.jpg'
    },
  })
  console.log('✅ CREATE: New user created:', newUser)

  // READ - Find unique user
  const foundUser = await prisma.user.findUnique({ 
    where: { id: newUser.id } 
  })
  console.log('✅ READ: Found user:', foundUser)

  // READ - Find all users (optional: limit for demo)
  const allUsers = await prisma.user.findMany({
    take: 5, // Limit to 5 users for demo
    orderBy: { createdAt: 'desc' }
  })
  console.log(`✅ READ: Found ${allUsers.length} users in database`)

  // UPDATE
  const updatedUser = await prisma.user.update({
    where: { id: newUser.id },
    data: { 
      name: 'Alice Smith',
      emailVerified: true,
      image: 'https://example.com/alice-updated.jpg'
    },
  })
  console.log('✅ UPDATE: User updated:', updatedUser)

  // READ - Verify update
  const verifyUpdate = await prisma.user.findUnique({
    where: { id: newUser.id }
  })
  console.log('✅ VERIFY: Updated user data:', {
    id: verifyUpdate?.id,
    name: verifyUpdate?.name,
    emailVerified: verifyUpdate?.emailVerified
  })

  // DELETE
  await prisma.user.delete({ 
    where: { id: newUser.id } 
  })
  console.log('✅ DELETE: User deleted')

  // VERIFY DELETE
  const deletedUser = await prisma.user.findUnique({
    where: { id: newUser.id }
  })
  console.log('✅ VERIFY DELETE: User should be null:', deletedUser)

  console.log('\n🎉 CRUD operations completed successfully!')
}

main()
  .catch((error) => {
    console.error('❌ Error during CRUD operations:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log('👋 Database connection closed')
  })