import { createServerFn } from "@tanstack/react-start";
import { runSafely } from "@/lib/errors";

export const bootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [{ viewer }, { hrdoViewer }, { serverEnvOptional }] = await Promise.all([
      import("./server/auth"),
      import("./server/hrdo/auth"),
      import("./server/env"),
    ]);
    return {
      viewer: await viewer(),
      hrdoViewer: await hrdoViewer(),
      analytics: { measurementId: serverEnvOptional("GA_MEASUREMENT_ID") ?? null },
    };
  } catch (error) {
    console.error(`[bootstrap] ${error instanceof Error ? error.message : "unknown"}`);
    return { viewer: null, hrdoViewer: null, analytics: { measurementId: null } };
  }
});

export const loginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => runSafely(async () => (await import("./server/auth")).login(data)));

export const hrdoLoginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/auth")).hrdoLogin(data)),
  );

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

export const hrdoLogoutFn = createServerFn({ method: "POST" }).handler(async () =>
  runSafely(async () => (await import("./server/hrdo/auth")).hrdoLogout()),
);

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).changePassword(data)),
  );

export const hrdoChangePasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/auth")).hrdoChangePassword(data)),
  );

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).updateProfile(data)),
  );

export const hrdoUpdateProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/auth")).hrdoUpdateProfile(data)),
  );

export const submitCoeRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).submitCoeRequest(data)),
  );

export const listMyCoeRequestsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/hrdo/coe")).listMyCoeRequests()),
);

export const listAllCoeRequestsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/hrdo/coe")).listAllCoeRequests()),
);

export const getCoeRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).getCoeRequest(data)),
  );

export const resubmitCoeRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).resubmitCoeRequest(data)),
  );

export const listCoeHistoryFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/hrdo/coe")).listCoeHistory()),
);

export const verifyCoeRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).verifyCoeRequest(data)),
  );

export const startCoeProcessingFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).startCoeProcessing(data)),
  );

export const requestCoeCorrectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).requestCoeCorrection(data)),
  );

export const rejectCoeRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).rejectCoeRequest(data)),
  );

export const uploadCoeDocumentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).uploadCoeDocument(data)),
  );

export const generateCoeTemplateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).generateCoeTemplate(data)),
  );

export const markCoeReadyFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).markCoeReady(data)),
  );

export const releaseCoeDocumentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).releaseCoeDocument(data)),
  );

export const getCoeDocumentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).getCoeDocument(data)),
  );

export const listRequestsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).listRequests(data)),
  );

export const getDestinationSuggestionsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).getDestinationSuggestions(data)),
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

export const updatePendingRequestFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).updatePendingRequest(data)),
  );

export const sendTripTicketFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).sendTripTicket(data)),
  );

export const getSignatoryAssistantsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/signatories")).getSignatoryAssistants()),
);

export const getPhoneDirectoryFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/signatories")).getPhoneDirectory()),
);

export const saveSignatoryPhoneNumberFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).saveSignatoryPhoneNumber(data)),
  );

export const saveSignatoryAssistantsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).saveSignatoryAssistants(data)),
  );

export const saveMainSignatoriesFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).saveMainSignatories(data)),
  );

export const createAssistantAccountFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).createAssistantAccount(data)),
  );

export const createMainSignatoryAccountFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/signatories")).createMainSignatoryAccount(data)),
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
