import Image from "next/image"
import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-4 text-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex aspect-square size-10 items-center justify-center">
              <Image
                src="/logo.png"
                alt="OpenCanvas Logo"
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
            <span className="text-xl font-bold tracking-tight">OpenCanvas</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}
