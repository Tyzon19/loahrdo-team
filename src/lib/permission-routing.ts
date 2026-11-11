export function isPermissionSlipDetailPath(pathname: string) {
  return pathname.startsWith("/permission-slips/") && pathname.length > "/permission-slips/".length;
}
