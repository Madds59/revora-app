export function PageHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-sm leading-6">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-2 lg:justify-end">{action}</div>}
    </header>
  );
}
