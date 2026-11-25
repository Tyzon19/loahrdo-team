import type { ComponentType } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listMyAttendanceFn } from "@/server-functions";
import { Route } from "@/routes/leaves.index";

vi.mock("@/server-functions", () => ({
  listMyAttendanceFn: vi.fn(),
  respondToAttendanceIncidentFn: vi.fn(),
  markAttendanceNotificationReadFn: vi.fn(),
  submitAttendanceClaimFn: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("live attendance credits", () => {
  it("rerenders sheet totals automatically without a refresh click", async () => {
    vi.useFakeTimers();
    vi.spyOn(Route, "useRouteContext").mockReturnValue({
      attendanceViewer: { id: "employee" },
    } as never);
    const data = {
      profile: {
        fullName: "TEST, EMPLOYEE",
        departmentGroup: "NON_TEACHING" as const,
        active: true,
        cycleStart: "2026-06-01",
        cycleEnd: "2027-05-31",
        remainingEl: 6,
        remainingSl: 5,
        remainingVl: 1.5,
        remainingBl: 1,
        leavesThisMonth: 0,
        leavesThisYear: 3.5,
        remarks: null,
        syncedAt: "2026-11-25 10:00:00",
      },
      claim: null,
      logs: [],
      notifications: [],
    };
    vi.mocked(listMyAttendanceFn).mockResolvedValue({ ok: true, data });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Page = Route.options.component as ComponentType;
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("13.5")).toBeInTheDocument();
    vi.mocked(listMyAttendanceFn).mockResolvedValue({
      ok: true,
      data: {
        ...data,
        profile: { ...data.profile, remainingVl: 4.5, syncedAt: "2026-11-25 10:00:01" },
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001);
    });
    expect(screen.getByText("16.5")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(listMyAttendanceFn).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
