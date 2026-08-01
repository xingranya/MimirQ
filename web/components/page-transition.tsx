export function PageTransition({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex-1 w-full h-full">
      {children}
    </div>
  )
}
