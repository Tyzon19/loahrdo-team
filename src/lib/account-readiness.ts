import { AppError } from "./errors";

export function assertAccountReady(account: {
  mustChangePassword?: boolean;
  needsProfileCompletion?: boolean;
}) {
  if (account.mustChangePassword || account.needsProfileCompletion) {
    throw new AppError("Complete your account setup before accessing this service.");
  }
}
