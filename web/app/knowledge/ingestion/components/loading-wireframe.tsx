'use client'

export function LoadingWireframe() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-background p-4">
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-4">
            <div className="h-4 w-32 rounded-md bg-muted" />
            <div className="h-16 rounded-md border border-dashed border-border" />
            <div className="h-16 rounded-md border border-dashed border-border" />
            <div className="h-16 rounded-md border border-dashed border-border" />
          </div>
          <div className="space-y-4 rounded-md border border-dashed border-border bg-background p-4">
            <div className="h-12 rounded-md border border-border" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, cardIndex) => cardIndex).map((cardIndex) => (
                <div
                  key={`ingestion-placeholder-card-${cardIndex}`}
                  className="h-24 rounded-md border border-dashed border-border bg-muted/20"
                />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="h-[18rem] rounded-md border border-dashed border-border bg-muted/20" />
              <div className="h-[18rem] rounded-md border border-dashed border-border bg-muted/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
