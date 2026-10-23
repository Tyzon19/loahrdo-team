import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Section, EmptyState } from "@/components/app/PageHeader";
import { LoadingPanel } from "@/components/app/LoadingPanel";
import { addVehicleFn, listVehiclesFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
import { canManageVehicles } from "@/lib/access";
import { fmtRange } from "@/lib/format";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: `Vehicles — ${SITE.name}` },
      { name: "description", content: "School vehicles, capacity and upcoming reservations." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Vehicles,
});

function Vehicles() {
  const { viewer } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const allowed = Boolean(viewer && canManageVehicles(viewer.role));
  const query = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => unwrap(listVehiclesFn()),
    enabled: allowed,
  });
  const [newVehicle, setNewVehicle] = useState({ type: "", plateNo: "", capacity: "" });
  const [busy, setBusy] = useState(false);

  if (!viewer) return null;
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
    const capacity = Number(newVehicle.capacity);
    if (!newVehicle.type.trim() || !newVehicle.plateNo.trim() || !Number.isInteger(capacity) || capacity < 1) {
      toast.error("Enter the vehicle type, plate number and a valid capacity.");
      return;
    }
    setBusy(true);
    const result = await addVehicleFn({
      data: { type: newVehicle.type.trim(), plateNo: newVehicle.plateNo.trim().toUpperCase(), capacity },
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewVehicle({ type: "", plateNo: "", capacity: "" });
    toast.success("Vehicle added.");
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Availability is based only on reservations recorded in this system. Confirm with the motor pool before dispatch."
      />
      <div className="space-y-4">
        <Section title="Vehicle list">
          {query.isPending ? (
            <LoadingPanel label="Loading vehicles" rows={4} />
          ) : query.isError ? (
            <div className="p-6 text-center" role="alert">
              <p className="font-medium">We couldn&apos;t load vehicles.</p>
              <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Try again
              </Button>
            </div>
          ) : (
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Vehicle Type</th>
                    <th className="px-3 py-2 font-medium">Plate No.</th>
                    <th className="px-3 py-2 font-medium">Capacity</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Upcoming reservations</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.vehicles ?? []).map((vehicle) => {
                    const reservations = (data?.reservations ?? []).filter(
                      (reservation) => reservation.vehicleId === vehicle.id,
                    );
                    return (
                      <tr key={vehicle.id} className="border-b align-top last:border-0">
                        <td className="px-3 py-2 font-medium">{vehicle.type}</td>
                        <td className="px-3 py-2 font-medium">{vehicle.plateNo}</td>
                        <td className="px-3 py-2 font-medium">{vehicle.capacity}</td>
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
                      </tr>
                    );
                  })}
                  {(data?.vehicles.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={5} className="font-medium text-center py-6">
                        No vehicles recorded yet. Add the first vehicle below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Add vehicle">
          <form className="grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={addVehicle}>
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
            <div>
              <Label htmlFor="vehicle-capacity">Capacity</Label>
              <Input
                id="vehicle-capacity"
                type="number"
                min={1}
                max={200}
                className="mt-1"
                value={newVehicle.capacity}
                onChange={(event) => setNewVehicle({ ...newVehicle, capacity: event.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add vehicle"}
            </Button>
          </form>
        </Section>
      </div>
    </>
  );
}
