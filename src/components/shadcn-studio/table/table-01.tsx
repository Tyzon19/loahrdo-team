import type { ReactNode } from "react";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function Table01({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <Table aria-label={label} className="min-w-[1080px] text-sm">
        {children}
      </Table>
    </div>
  );
}

export default Table01;
