export default function EditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Standalone layout that completely bypasses the dashboard sidebar
  // Returns only the editor content without any sidebar wrapper
  return (
    <main className="fixed inset-0 h-screen w-screen overflow-hidden bg-background">
      {children}
    </main>
  )
}
