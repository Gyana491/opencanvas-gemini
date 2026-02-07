import 'dotenv/config'
import { PrismaClient } from "./generated/prisma"
import { PrismaNeon } from "@prisma/adapter-neon"

const globalForPrisma = global as unknown as {
    prisma: PrismaClient
}

const adapter = new PrismaNeon({ 
  connectionString: process.env.DATABASE_URL! 
})

const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Test database connection
async function testConnection() {
  try {
    await prisma.$connect()
    console.log('✅ Database connected successfully!')
  } catch (error) {
    console.error('❌ Failed to connect to database:', error)
    process.exit(1)
  }
}

// Test connection on application startup
testConnection()

export default prisma