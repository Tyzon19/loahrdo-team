import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceClaimCard } from "@/components/attendance/ClaimCard";
import { submitAttendanceClaimFn } from "@/server-functions";

vi.mock("@/server-functions", () => ({ submitAttendanceClaimFn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(
  pending = false,
  claim: {
    firstName: string;
    middleInitial: string;
    lastName: string;
    departmentGroup: "NON_TEACHING" | "COLLEGE" | "BASIC_ED";
  } | null = null,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AttendanceClaimCard pending={pending} claim={claim} />
    </QueryClientProvider>,
  );
}

describe("private attendance account linking card", () => {
  it("asks for only the four identity fields and never lists employee names", () => {
    show();
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Non-Teaching",
      "College",
      "Basic Education",
    ]);
    expect(screen.getByLabelText("First Name")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.queryByLabelText(/employee id/i)).not.toBeInTheDocument();
  });
  it("submits names and department without a profile or account identifier", async () => {
    vi.mocked(submitAttendanceClaimFn).mockResolvedValue({
      ok: true,
      data: { status: "PENDING_REVIEW" },
    });
    show();
    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Carl Christian" } });
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Concepcion" } });
    fireEvent.change(screen.getByLabelText("Department Group"), { target: { value: "COLLEGE" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for HRDO verification" }));
    await waitFor(() =>
      expect(submitAttendanceClaimFn).toHaveBeenCalledWith({
        data: {
          firstName: "Carl Christian",
          middleInitial: "",
          lastName: "Concepcion",
          departmentGroup: "COLLEGE",
        },
      }),
    );
  });
  it("shows pending review and keeps failed submissions correctable", async () => {
    vi.mocked(submitAttendanceClaimFn).mockResolvedValue({
      ok: false,
      error: "Please enter your complete first name.",
    });
    show(true);
    expect(screen.getByRole("status")).toHaveTextContent("awaiting HRDO");
    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Carl" } });
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Concepcion" } });
    fireEvent.click(screen.getByRole("button", { name: "Update claim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("complete first name");
    expect(screen.getByRole("button", { name: "Update claim" })).toBeEnabled();
  });
  it("prefills a pending claim so Update claim resubmits the saved details", async () => {
    const saved = {
      firstName: "Mark Joseph",
      middleInitial: "P",
      lastName: "Turingan",
      departmentGroup: "BASIC_ED" as const,
    };
    vi.mocked(submitAttendanceClaimFn).mockResolvedValue({
      ok: true,
      data: { status: "PENDING_REVIEW" },
    });
    show(true, saved);
    expect(screen.getByLabelText("First Name")).toHaveValue("Mark Joseph");
    expect(screen.getByLabelText("Middle Initial")).toHaveValue("P");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Turingan");
    expect(screen.getByLabelText("Department Group")).toHaveValue("BASIC_ED");
    fireEvent.click(screen.getByRole("button", { name: "Update claim" }));
    await waitFor(() => expect(submitAttendanceClaimFn).toHaveBeenCalledWith({ data: saved }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Claim updated. HRDO will verify your corrected details.",
      ),
    );
  });
});
