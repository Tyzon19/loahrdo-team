import { createServerFn } from "@tanstack/react-start";

const runSafely = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error(`[server function] ${error instanceof Error ? error.message : "unknown"}`);
    throw error;
  }
};
export const bootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [{ viewer }, { serverEnvOptional }] = await Promise.all([
      import("./auth"),
      import("./env"),
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

export const loginFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./auth")).login(data)),
);

export const requestRegistrationOtpFn = createServerFn({ method: "POST" }).handler(
  async ({ data }) => runSafely(async () => (await import("./auth")).requestRegistrationOtp(data)),
);

export const verifyRegistrationOtpFn = createServerFn({ method: "POST" }).handler(
  async ({ data }) => runSafely(async () => (await import("./auth")).verifyRegistrationOtp(data)),
);

export const logoutFn = createServerFn({ method: "POST" }).handler(async () =>
  runSafely(async () => (await import("./auth")).logout()),
);

export const changePasswordFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./auth")).changePassword(data)),
);

export const updateProfileFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./auth")).updateProfile(data)),
);

export const listRequestsFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).listRequests(data)),
);

export const getRequestFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).getRequestDetail(data)),
);

export const getPrintableRequestFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).getPrintableRequestDetail(data)),
);

export const submitRequestFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).submitRequest(data)),
);

export const approveRequestFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).approveRequest(data)),
);

export const rejectRequestFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).rejectRequest(data)),
);

export const resubmitRequestFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).resubmitRequest(data)),
);

export const dashboardStatsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./requests")).dashboardStats()),
);

export const listVehiclesFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./requests")).listVehicles()),
);

export const addVehicleFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./requests")).addVehicle(data)),
);

export const listNotificationsFn = createServerFn({ method: "GET" }).handler(async () =>
  runSafely(async () => (await import("./notifications")).listNotifications()),
);

export const markNotificationReadFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./notifications")).markNotificationRead(data)),
);

export const recordPageViewFn = createServerFn({ method: "POST" }).handler(async ({ data }) =>
  runSafely(async () => (await import("./analytics")).recordPageView(data)),
);
