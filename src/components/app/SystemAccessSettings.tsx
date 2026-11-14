import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { unwrap } from "@/lib/api";
import { listSystemAccessUsersFn, setSystemAccessAssignmentFn } from "@/server-functions";

type AccessSystem = "super_admin" | "permission_slip_admin";

export function SystemAccessSettings({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const updateLock = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const query = useQuery({
    queryKey: ["system-access-users"],
    queryFn: () => unwrap(listSystemAccessUsersFn()),
  });

  async function updateAccess(
    user: NonNullable<typeof query.data>[number],
    system: AccessSystem,
    enabled: boolean,
  ) {
    if (updateLock.current) return;
    if (
      system === "super_admin" &&
      enabled &&
      !window.confirm(`Grant Super Admin access to ${user.name} (${user.email})?`)
    ) {
      return;
    }

    updateLock.current = true;
    setIsSaving(true);
    try {
      await unwrap(
        setSystemAccessAssignmentFn({
          data: { userId: user.id, system, enabled },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ["system-access-users"] });
      toast.success(enabled ? "System access granted." : "System access removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't update system access.");
    } finally {
      updateLock.current = false;
      setIsSaving(false);
    }
  }

  if (query.isPending) return <LoadingPanel label="Loading system access" />;

  if (query.isError) {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 p-4">
        <p className="font-medium">We couldn't load system access.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "Please try again."}
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-md border px-3 text-sm font-medium hover:bg-accent"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="System access">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Super Admins can manage access across the system. Permission Slip Admins can view the
        pending queue, but only assigned signatories can approve or reject requests.
      </p>
      {query.data?.length ? (
        <ul className="divide-y rounded-md border bg-background">
          {query.data.map((user) => {
            const selfRoot = user.id === currentUserId && user.isSuperAdmin;
            return (
              <li
                key={user.id}
                className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                </div>
                <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Access for {user.name}</legend>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      checked={user.isSuperAdmin}
                      disabled={selfRoot || isSaving}
                      onCheckedChange={(checked) =>
                        void updateAccess(user, "super_admin", checked === true)
                      }
                      aria-label={`Super Admin access for ${user.name}${
                        selfRoot ? " (self-removal disabled)" : ""
                      }`}
                    />
                    <span>
                      Super Admin{selfRoot && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      checked={user.isPermissionSlipAdmin}
                      disabled={isSaving}
                      onCheckedChange={(checked) =>
                        void updateAccess(user, "permission_slip_admin", checked === true)
                      }
                      aria-label={`Permission Slip Admin access for ${user.name}`}
                    />
                    <span className="flex flex-col">
                      Permission Slip Admin
                      <span className="text-xs text-muted-foreground">View-only queue</span>
                    </span>
                  </label>
                </fieldset>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
          No institutional accounts are available to assign.
        </p>
      )}
    </section>
  );
}
