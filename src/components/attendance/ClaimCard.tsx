import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LABELS } from "@/lib/attendance";
import { STAFF_GROUPS, type StaffGroup } from "@/lib/late-absences";
import { unwrap } from "@/lib/api";
import { submitAttendanceClaimFn } from "@/server-functions";

export function AttendanceClaimCard({
  pending,
  claim,
}: {
  pending: boolean;
  claim?: {
    firstName: string;
    middleInitial: string;
    lastName: string;
    departmentGroup: StaffGroup;
  } | null;
}) {
  const cache = useQueryClient();
  const [firstName, setFirstName] = useState(claim?.firstName ?? "");
  const [middleInitial, setMiddleInitial] = useState(claim?.middleInitial ?? "");
  const [lastName, setLastName] = useState(claim?.lastName ?? "");
  const [departmentGroup, setDepartmentGroup] = useState<StaffGroup>(
    claim?.departmentGroup ?? "NON_TEACHING",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await unwrap(
        submitAttendanceClaimFn({ data: { firstName, middleInitial, lastName, departmentGroup } }),
      );
      toast.success(
        pending
          ? "Claim updated. HRDO will verify your corrected details."
          : "Claim submitted. HRDO will verify your details.",
      );
      await cache.invalidateQueries({ queryKey: ["my-attendance"] });
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : "Unable to submit your claim. Try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Link HRDO Attendance Record</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter your complete given name and surname as recorded by HRDO. HRDO will verify the exact
          tracker row before linking your account.
        </p>
        {pending && (
          <p role="status" className="rounded-md border bg-muted p-3 text-sm">
            Your request is awaiting HRDO verification. You can correct your details below.
          </p>
        )}
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="claim-first">First Name</Label>
            <Input
              id="claim-first"
              autoComplete="given-name"
              required
              maxLength={100}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="claim-middle">Middle Initial</Label>
            <Input
              id="claim-middle"
              autoComplete="additional-name"
              maxLength={6}
              value={middleInitial}
              onChange={(e) => setMiddleInitial(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="claim-last">Last Name</Label>
            <Input
              id="claim-last"
              autoComplete="family-name"
              required
              maxLength={100}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="claim-group">Department Group</Label>
            <select
              id="claim-group"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={departmentGroup}
              onChange={(e) => setDepartmentGroup(e.target.value as StaffGroup)}
            >
              {STAFF_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {DEPARTMENT_LABELS[group]}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
          <Button className="min-h-11 sm:justify-self-start" disabled={busy} type="submit">
            {busy ? "Submitting…" : pending ? "Update claim" : "Submit for HRDO verification"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
