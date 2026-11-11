import type { Role } from "@/lib/types";

export const PERMISSION_HEAD_EMAIL = "hrdirector@lyceumalabang.edu.ph";

type PermissionViewer = Pick<{ email: string; role: Role }, "email" | "role">;

/**
 * Permission Slips are handled by the designated HRDO director. Keep the
 * existing department-head role compatible while also supporting the named
 * director account used by the HRDO workflow.
 */
export function isPermissionHead(viewer: PermissionViewer | null | undefined) {
  return Boolean(
    viewer &&
    (viewer.role === "department_head" ||
      viewer.email.trim().toLowerCase() === PERMISSION_HEAD_EMAIL),
  );
}
