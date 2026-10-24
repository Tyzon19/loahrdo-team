import { createServerFn } from "@tanstack/react-start";
import { runSafely } from "@/lib/errors";

/**
 * Client entry points. Each handler dynamically imports its server-only module
 * so MySQL credentials and queries never enter the browser bundle. Every
 * service re-checks the session and role before touching data.
 */

export const bootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [{ viewer }, { serverEnvOptional }] = await Promise.all([
      import("./server/auth"),
      import("./server/env"),
    ]);
    return {
      viewer: await viewer(),
      analytics: { measurementId: serverEnvOptional("GA_MEASUREMENT_ID") ?? null },
    };
  } catch (error) {
    console.error(`[bootstrap] ${error instanceof Error ? error.message : "unknown"}`);
    return { viewer: null, analytics: { measurementId: null } };
  }
});

export const loginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => runSafely(async () => (await import("./server/auth")).login(data)));

export const requestRegistrationOtpFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).requestRegistrationOtp(data)),
  );

export const verifyRegistrationOtpFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).verifyRegistrationOtp(data)),
  );

export const logoutFn = createServerFn({ method: "POST" }).handler(async () =>
  runSafely(async () => (await import("./server/auth")).logout()),
);

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).changePassword(data)),
  );

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).updateProfile(data)),
  );

export const listRequestsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).listRequests(data)),
  );

export const getRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).getRequestDetail(data)),
  );

export const getPrintableRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).getPrintableRequestDetail(data)),
  );

export const submitRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).submitRequest(data)),
  );

export const approveRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).approveRequest(data)),
  );

export const rejectRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).rejectRequest(data)),
  );

export const resubmitRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).resubmitRequest(data)),
  );

export const sendTripTicketFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).sendTripTicket(data)),
  );

export const getSignatoryAssistantsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/signatories")).getSignatoryAssistants()),
);

export const saveSignatoryAssistantsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).saveSignatoryAssistants(data)),
  );

export const createAssistantAccountFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).createAssistantAccount(data)),
  );

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).resetUserPassword(data)),
  );

export const dashboardStatsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/requests")).dashboardStats()),
);

export const listVehiclesFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/requests")).listVehicles()),
);

export const addVehicleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).addVehicle(data)),
  );

export const listNotificationsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/notifications")).listNotifications()),
);

export const notificationImageFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/notifications")).notificationImage(data)),
  );

export const officialTripTicketImageFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/notifications")).officialTripTicketImage(data)),
  );

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/notifications")).markNotificationRead(data)),
  );

export const markApprovalNoticeReadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/notifications")).markApprovalNoticeRead(data)),
  );

export const recordPageViewFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/analytics")).recordPageView(data)),
  );

export const getTripArchiveFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/analytics")).getTripArchive(data)),
  );
