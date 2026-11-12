import { createServerFn } from "@tanstack/react-start";
import { runSafely } from "@/lib/errors";

export const bootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [{ viewer }, { hrdoViewer }, { permissionViewer }, { serverEnvOptional }] =
      await Promise.all([
        import("./server/auth"),
        import("./server/hrdo/auth"),
        import("./server/permission/auth"),
        import("./server/env"),
      ]);
    return {
      viewer: await viewer(),
      hrdoViewer: await hrdoViewer(),
      permissionViewer: await permissionViewer(),
      analytics: { measurementId: serverEnvOptional("GA_MEASUREMENT_ID") ?? null },
    };
  } catch (error) {
    console.error(`[bootstrap] ${error instanceof Error ? error.message : "unknown"}`);
    return {
      viewer: null,
      hrdoViewer: null,
      permissionViewer: null,
      analytics: { measurementId: null },
    };
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

export const requestHrdoPasswordRecoveryFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/auth")).requestHrdoPasswordRecovery(data)),
  );

export const resetHrdoPasswordWithRecoveryCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () =>
      (await import("./server/hrdo/auth")).resetHrdoPasswordWithRecoveryCode(data),
    ),
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

export const requestPasswordRecoveryFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).requestPasswordRecovery(data)),
  );

export const resetPasswordWithRecoveryCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).resetPasswordWithRecoveryCode(data)),
  );

export const logoutFn = createServerFn({ method: "POST" }).handler(async () =>
  runSafely(async () => (await import("./server/auth")).logout()),
);

export const permissionLoginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/permission/auth")).permissionLogin(data)),
  );

export const permissionLogoutFn = createServerFn({ method: "POST" }).handler(async () =>
  runSafely(async () => (await import("./server/permission/auth")).permissionLogout()),
);

export const submitPermissionSlipFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/permission")).submitPermissionSlip(data)),
  );

export const listMyPermissionSlipsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/permission")).listMyPermissionSlips()),
);

export const listPendingPermissionSlipsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/permission")).listPendingPermissionSlips()),
);

export const getPermissionSlipFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/permission")).getPermissionSlip(data)),
  );

export const approvePermissionSlipFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/permission")).approvePermissionSlip(data)),
  );

export const rejectPermissionSlipFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/permission")).rejectPermissionSlip(data)),
  );

export const sendPermissionSlipReceiptFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/permission")).sendPermissionSlipReceipt(data)),
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

export const completeProfileNameFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/auth")).completeProfileName(data)),
  );

export const hrdoUpdateProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/auth")).hrdoUpdateProfile(data)),
  );

export const hrdoCompleteProfileNameFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/auth")).hrdoCompleteProfileName(data)),
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

export const searchStaffCoeRequestsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).searchStaffCoeRequests(data)),
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

export const markCoeViewedFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).markCoeViewed(data)),
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

export const sendCoeTemplateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).sendCoeTemplate(data)),
  );

export const uploadCoeManualDeliveryFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/coe")).uploadCoeManualDelivery(data)),
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

export const listHrdoProcessorAccountsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/hrdo/admin")).listHrdoProcessorAccounts()),
);

export const getHrdoCoeAnalyticsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./server/hrdo/analytics")).getCoeAnalytics()),
);

export const createHrdoProcessorAccountFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/hrdo/admin")).createHrdoProcessorAccount(data)),
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

export const deleteVehicleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).deleteVehicle(data)),
  );

export const updateVehicleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    runSafely(async () => (await import("./server/requests")).updateVehicle(data)),
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
