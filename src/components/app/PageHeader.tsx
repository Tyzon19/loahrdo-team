import type { ReactNode } from "react";
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-xl font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 min-w-0 break-words text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}
export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel min-w-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="min-w-0 break-words text-sm font-semibold">{title}</h2>
        {actions && <div className="ml-auto flex max-w-full flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}
export function Field({
  label,
  children,
  comfortable = false,
}: {
  label: string;
  children: ReactNode;
  comfortable?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt
        className={`font-medium uppercase tracking-wide text-muted-foreground ${comfortable ? "text-[13px]" : "text-xs"}`}
      >
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-words [overflow-wrap:anywhere] text-foreground ${
          comfortable ? "text-base font-semibold leading-6 sm:text-[17px]" : "text-sm"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}