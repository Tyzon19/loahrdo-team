import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { ButtonLoading, LoadingPanel } from "@/components/app/LoadingPanel";
import { addVehicleFn, deleteVehicleFn, listVehiclesFn, updateVehicleFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { canManageVehicles } from "@/lib/access";
import { fmtRange } from "@/lib/format";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: `Vehicles — ${SITE.name}` },
      { name: "description", content: "List of drivers, vehicles and upcoming reservations." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Vehicles,
});

function Vehicles() {
  const { viewer } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const allowed = Boolean(viewer && canManageVehicles(viewer.role, viewer.isSuperAdmin));
  const query = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => unwrap(listVehiclesFn()),
    enabled: allowed,
  });
  const [newVehicle, setNewVehicle] = useState({ driverName: "", type: "", plateNo: "" });
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<{
    id: string;
    driverName: string;
    type: string;
    plateNo: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  if (!viewer) return null;
  const canEditVehicles = viewer.role === "admin" || viewer.isSuperAdmin;
  if (!allowed) {
    return (
      <Section title="Not available">
        <EmptyState title="Vehicle records are managed by Transport Services.">
          Your account does not have access to the fleet register.
        </EmptyState>
      </Section>
    );
  }

  const data = query.data;

  async function addVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!newVehicle.driverName.trim() || !newVehicle.type.trim() || !newVehicle.plateNo.trim()) {
      toast.error("Enter the driver's name, vehicle type and plate number.");
      return;
    }
    setBusy(true);
    const result = await addVehicleFn({
      data: {
        driverName: newVehicle.driverName.trim(),
        type: newVehicle.type.trim(),
        plateNo: newVehicle.plateNo.trim().toUpperCase(),
      },
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewVehicle({ driverName: "", type: "", plateNo: "" });
    toast.success("Vehicle added.");
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  async function deleteVehicle(id: string, driverName: string, plateNo: string) {
    if (!canEditVehicles || deletingId) return;
    if (
      !window.confirm(
        `Delete ${driverName}'s vehicle record (${plateNo})? Existing request history will be preserved.`,
      )
    ) {
      return;
    }
    setDeletingId(id);
    const result = await deleteVehicleFn({ data: { id } });
    setDeletingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Vehicle record deleted.");
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  async function saveVehicleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingVehicle || savingEdit) return;
    if (
      !editingVehicle.driverName.trim() ||
      !editingVehicle.type.trim() ||
      !editingVehicle.plateNo.trim()
    ) {
      toast.error("Enter the driver's name, vehicle type and plate number.");
      return;
    }
    setSavingEdit(true);
    const result = await updateVehicleFn({
      data: {
        id: editingVehicle.id,
        driverName: editingVehicle.driverName.trim(),
        type: editingVehicle.type.trim(),
        plateNo: editingVehicle.plateNo.trim().toUpperCase(),
      },
    });
    setSavingEdit(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEditingVehicle(null);
    toast.success("Vehicle record updated.");
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  return (
    <>
      <PageHeader
        title="List Drivers and Vehicles"
        description="Manage assigned drivers, vehicle types and plate numbers."
      />
      <div className="space-y-4">
        <Section title="Drivers and vehicles">
          {query.isPending ? (
            <LoadingPanel label="Loading vehicles" />
          ) : query.isError ? (
            <div className="p-6 text-center" role="alert">
              <p className="font-medium">We couldn&apos;t load vehicles.</p>
              <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Try again
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="data-table min-w-[960px] table-fixed">
                <thead className="border-b bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Driver Name
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Vehicle Type
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Plate No.
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Upcoming reservations
                    </th>
                    {canEditVehicles && (
                      <th scope="col" className="px-3 py-2 font-medium">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(data?.vehicles ?? []).map((vehicle) => {
                    const reservations = (data?.reservations ?? []).filter(
                      (reservation) => reservation.vehicleId === vehicle.id,
                    );
                    return (
                      <tr key={vehicle.id} className="border-b align-top last:border-0">
                        <td className="px-3 py-2 font-medium">{vehicle.driverName}</td>
                        <td className="px-3 py-2 font-medium">{vehicle.type}</td>
                        <td className="px-3 py-2 font-medium">{vehicle.plateNo}</td>
                        <td className="px-3 py-2 font-medium">
                          {vehicle.status === "in_service" ? (
                            "In service"
                          ) : (
                            <span className="text-warning">Under maintenance</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {reservations.length ? (
                            <ul>
                              {reservations.map((reservation) => (
                                <li key={reservation.number}>
                                  {reservation.number} ·{" "}
                                  {fmtRange(reservation.dateStart, reservation.dateEnd)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-muted-foreground">None recorded</span>
                          )}
                        </td>
                        {canEditVehicles && (
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={deletingId !== null || editingVehicle !== null}
                                onClick={() =>
                                  setEditingVehicle({
                                    id: vehicle.id,
                                    driverName: vehicle.driverName,
                                    type: vehicle.type,
                                    plateNo: vehicle.plateNo,
                                  })
                                }
                                aria-label={`Edit ${vehicle.driverName} vehicle record`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={deletingId !== null || editingVehicle !== null}
                                onClick={() =>
                                  void deleteVehicle(
                                    vehicle.id,
                                    vehicle.driverName,
                                    vehicle.plateNo,
                                  )
                                }
                                aria-label={`Delete ${vehicle.driverName} vehicle record`}
                              >
                                {deletingId === vehicle.id ? (
                                  <ButtonLoading label="Deleting…" />
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                    Delete
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {(data?.vehicles.length ?? 0) === 0 && (
                    <tr>
                      <td
                        colSpan={canEditVehicles ? 6 : 5}
                        className="font-medium text-center py-6"
                      >
                        No vehicles recorded yet. Add the first vehicle below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {canEditVehicles && editingVehicle && (
          <Section title="Edit vehicle">
            <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={saveVehicleEdit}>
              <div>
                <Label htmlFor="edit-vehicle-driver">Driver Name</Label>
                <Input
                  id="edit-vehicle-driver"
                  className="mt-1"
                  maxLength={120}
                  value={editingVehicle.driverName}
                  onChange={(event) =>
                    setEditingVehicle({ ...editingVehicle, driverName: event.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-vehicle-type">Vehicle Type</Label>
                <Input
                  id="edit-vehicle-type"
                  className="mt-1"
                  maxLength={80}
                  value={editingVehicle.type}
                  onChange={(event) =>
                    setEditingVehicle({ ...editingVehicle, type: event.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-vehicle-plate">Plate No.</Label>
                <Input
                  id="edit-vehicle-plate"
                  className="mt-1"
                  maxLength={32}
                  value={editingVehicle.plateNo}
                  onChange={(event) =>
                    setEditingVehicle({
                      ...editingVehicle,
                      plateNo: event.target.value.toUpperCase(),
                    })
                  }
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? <ButtonLoading label="Saving…" /> : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingEdit}
                  onClick={() => setEditingVehicle(null)}
                >
                  <X className="h-4 w-4" aria-hidden />
                  Cancel
                </Button>
              </div>
            </form>
          </Section>
        )}

        <Section title="Add vehicle">
          <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={addVehicle}>
            <div>
              <Label htmlFor="vehicle-driver">Driver Name</Label>
              <Input
                id="vehicle-driver"
                className="mt-1"
                maxLength={120}
                value={newVehicle.driverName}
                onChange={(event) =>
                  setNewVehicle({ ...newVehicle, driverName: event.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="vehicle-type">Vehicle Type</Label>
              <Input
                id="vehicle-type"
                className="mt-1"
                maxLength={80}
                value={newVehicle.type}
                onChange={(event) => setNewVehicle({ ...newVehicle, type: event.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="vehicle-plate">Plate No.</Label>
              <Input
                id="vehicle-plate"
                className="mt-1"
                maxLength={32}
                value={newVehicle.plateNo}
                onChange={(event) =>
                  setNewVehicle({ ...newVehicle, plateNo: event.target.value.toUpperCase() })
                }
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <ButtonLoading label="Adding…" /> : "Add vehicle"}
            </Button>
          </form>
        </Section>
      </div>
    </>
  );
}
