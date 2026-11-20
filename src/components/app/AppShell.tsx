import { Fragment, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BarChart3,
  Building2,
  Car,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  FileText,
  Images,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PhoneCall,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Role, Viewer } from "@/lib/types";
import { ROLE_TITLES } from "@/lib/workflow";
import { canAccessAdminPortal } from "@/lib/access";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/app/LoadingPanel";
import { cn } from "@/lib/utils";
import { listNotificationsFn, logoutFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
type NavItem = {
  to: string;
  label: string;
  mobileLabel: string;
  icon: typeof Bell;
  exact?: boolean;
  section?: string;
};
const ITEMS = {
  adminHome: {
    to: "/admin",
    label: "Admin Dashboard",
    mobileLabel: "Home",
    icon: LayoutDashboard,
    exact: true,
    section: "Portal",
  },
  receipts: {
    to: "/receipts",
    label: "Receipts Archive",
    mobileLabel: "Receipts",
    icon: Images,
    exact: true,
    section: "Portal",
  },
  dash: {
    to: "/dashboard",
    label: "Dashboard",
    mobileLabel: "Home",
    icon: LayoutDashboard,
    exact: true,
  },
  vehicleDashboard: {
    to: "/dashboard",
    label: "Vehicle Trip Ticket",
    mobileLabel: "Vehicle",
    icon: Car,
    exact: true,
    section: "Vehicle Trip Ticket",
  },
  newReq: {
    to: "/requests/new",
    label: "New Vehicle Request",
    mobileLabel: "New request",
    icon: FilePlus2,
  },
  myReq: {
    to: "/requests",
    label: "My Requests",
    mobileLabel: "My requests",
    icon: ClipboardList,
    exact: true,
  },
  req: {
    to: "/requests",
    label: "Requests",
    mobileLabel: "Requests",
    icon: ClipboardList,
    exact: true,
  },
  vehicles: { to: "/vehicles", label: "Vehicles", mobileLabel: "Vehicles", icon: Car },
  notif: { to: "/notifications", label: "Notifications", mobileLabel: "Alerts", icon: Bell },
  permission: {
    to: "/permission-slips",
    label: "Permission Slips",
    mobileLabel: "Permission",
    icon: ShieldCheck,
  },
  attendanceAdmin: {
    to: "/admin/late-absences",
    label: "Late & Absences",
    mobileLabel: "Attendance",
    icon: ClipboardCheck,
    section: "Other systems",
  },
  coe: {
    to: "/hrdo/dashboard",
    label: "Certificate of Employment",
    mobileLabel: "COE",
    icon: FileText,
    section: "Other systems",
  },
  phoneDirectory: {
    to: "/phone-directory",
    label: "LOA Phone Directory",
    mobileLabel: "Directory",
    icon: PhoneCall,
  },
  profile: { to: "/profile", label: "Profile", mobileLabel: "Profile", icon: UserRound },
  profileSettings: {
    to: "/profile",
    label: "Profile & Settings",
    mobileLabel: "Profile",
    icon: UserRound,
  },
  tripArchive: {
    to: "/trip-archive",
    label: "Trip Archive & Analytics",
    mobileLabel: "Archive",
    icon: BarChart3,
  },
} satisfies Record<string, NavItem>;
export const NAV: Record<Role, NavItem[]> = {
  requisitioner: [ITEMS.newReq, ITEMS.myReq, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  department_head: [ITEMS.dash, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  transport_head: [
    ITEMS.dash,
    ITEMS.req,
    ITEMS.vehicles,
    ITEMS.notif,
    ITEMS.phoneDirectory,
    ITEMS.profile,
  ],
  director: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  president: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  transport_staff: [
    ITEMS.dash,
    ITEMS.vehicles,
    ITEMS.req,
    ITEMS.notif,
    ITEMS.phoneDirectory,
    ITEMS.profile,
  ],
  assistant: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  guard: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  driver: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.phoneDirectory, ITEMS.profile],
  admin: [
    ITEMS.adminHome,
    ITEMS.receipts,
    ITEMS.vehicleDashboard,
    { ...ITEMS.req, section: "Vehicle Trip Ticket" },
    { ...ITEMS.vehicles, section: "Vehicle Trip Ticket" },
    { ...ITEMS.tripArchive, section: "Vehicle Trip Ticket" },
    ITEMS.attendanceAdmin,
    { ...ITEMS.coe, section: "Other systems" },
    { ...ITEMS.permission, section: "Other systems" },
    { ...ITEMS.notif, section: "Account" },
    { ...ITEMS.phoneDirectory, section: "Account" },
    { ...ITEMS.profileSettings, section: "Account" },
  ],
};

function permissionNavSearch(permissionPortal: boolean, item: NavItem) {
  if (!permissionPortal) return undefined;
  if (item.to === "/permission-slips") return { view: undefined };
  if (item.to === "/profile") return { portal: "permission" as const };
  return undefined;
}

function navItemsFor(user: Viewer, permissionPortal: boolean): NavItem[] {
  if (permissionPortal && !canAccessAdminPortal(user.role, user.isSuperAdmin)) {
    return [ITEMS.permission, ITEMS.profile];
  }
  if (user.isSuperAdmin) {
    return user.role === "requisitioner" ? [ITEMS.newReq, ...NAV.admin] : NAV.admin;
  }
  return NAV[user.role] ?? [ITEMS.dash, ITEMS.profile];
}

function SideNav({
  user,
  unread,
  permissionPortal,
  onNavigate,
}: {
  user: Viewer;
  unread: number;
  permissionPortal: boolean;
  onNavigate?: () => void;
}) {
  const location = useRouterState({ select: (r) => r.location.pathname });
  const items = navItemsFor(user, permissionPortal);
  const centralAdmin = canAccessAdminPortal(user.role, user.isSuperAdmin);
  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground" aria-label="Main">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-sm font-semibold leading-tight text-sidebar-accent-foreground">
          Lyceum of Alabang
        </p>
        <p className="text-xs opacity-80">
          {centralAdmin
            ? "Admin Portal"
            : permissionPortal
              ? "Permission Slip System"
              : "Vehicle Reservation & Trip Ticket"}
        </p>
      </div>
      <ul className="flex-1 py-2">
        {items.map((item, index) => {
          const active = isNavItemActive(item, location);
          const search = permissionNavSearch(permissionPortal, item);
          return (
            <Fragment key={item.to + item.label}>
              {item.section && item.section !== items[index - 1]?.section && (
                <li className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                  {item.section}
                </li>
              )}
              <li>
                <Link
                  to={item.to}
                  {...(search ? { search } : {})}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 border-l-4 px-4 py-2 text-sm transition-colors",
                    active
                      ? "border-sidebar-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/notifications" && unread > 0 && (
                    <span className="rounded-sm bg-sidebar-primary px-1.5 text-xs text-sidebar-primary-foreground">
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>
      <div className="border-t border-sidebar-border px-4 py-3 text-xs opacity-80">
        <p>
          {centralAdmin ? "LOA Systems" : permissionPortal ? "HRDO" : "PFMO"} · Lyceum of Alabang
        </p>
        <Link
          to="/privacy"
          onClick={onNavigate}
          className="mt-1 inline-flex items-center gap-1 hover:underline"
        >
          <ShieldCheck className="h-3 w-3" aria-hidden /> Privacy Policy
        </Link>
      </div>
    </nav>
  );
}

function isNavItemActive(item: NavItem, path: string) {
  if (item.to === "/permission-slips") {
    return path === "/permission-slips" || path.startsWith("/permission-slips/");
  }

  if (item.to === "/requests") {
    return path === "/requests" || (path.startsWith("/requests/") && path !== "/requests/new");
  }
  return item.exact ? path === item.to || path === item.to + "/" : path.startsWith(item.to);
}

function MobileNav({
  user,
  unread,
  permissionPortal,
}: {
  user: Viewer;
  unread: number;
  permissionPortal: boolean;
}) {
  const location = useRouterState({ select: (r) => r.location.pathname });
  const items = navItemsFor(user, permissionPortal).filter(
    (item) => item.to !== "/profile" || item.label === "Profile",
  );
  const centralAdmin = canAccessAdminPortal(user.role, user.isSuperAdmin);
  const primaryItems =
    items.length > 4
      ? centralAdmin
        ? [ITEMS.adminHome, ITEMS.vehicleDashboard, ITEMS.req]
        : items.slice(0, 3)
      : items;
  const overflowItems = items.filter(
    (item) =>
      !primaryItems.some((primary) => primary.to === item.to && primary.label === item.label),
  );
  const moreActive = overflowItems.some((item) => isNavItemActive(item, location));

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      aria-label="Mobile navigation"
    >
      <ul className="mx-auto grid w-full max-w-lg grid-flow-col auto-cols-fr gap-1">
        {primaryItems.map((item) => {
          const active = isNavItemActive(item, location);
          const search = permissionNavSearch(permissionPortal, item);
          return (
            <li key={item.to + item.label} className="min-w-0">
              <Link
                to={item.to}
                {...(search ? { search } : {})}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium leading-tight transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className="h-5 w-5" aria-hidden />
                  {item.to === "/notifications" && unread > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{item.mobileLabel}</span>
              </Link>
            </li>
          );
        })}
        {overflowItems.length > 0 && (
          <li className="min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More navigation options"
                  aria-current={moreActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium leading-tight transition-colors",
                    moreActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden />
                  <span>More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="mb-1 w-56">
                {overflowItems.map((item) => {
                  const search = permissionNavSearch(permissionPortal, item);
                  return (
                    <DropdownMenuItem key={item.to + item.label} asChild className="min-h-11">
                      <Link
                        to={item.to}
                        {...(search ? { search } : {})}
                        aria-current={isNavItemActive(item, location) ? "page" : undefined}
                      >
                        <item.icon className="h-4 w-4" aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
      </ul>
    </nav>
  );
}

export function AppShell({ user, children }: { user: Viewer; children: ReactNode }) {
  const [signingOut, setSigningOut] = useState(false);
  const location = useRouterState({
    select: (router) => ({
      pathname: router.location.pathname,
      searchStr: router.location.searchStr,
    }),
  });
  const permissionPortal =
    !canAccessAdminPortal(user.role, user.isSuperAdmin) &&
    (location.pathname.startsWith("/permission-slips") ||
      (location.pathname === "/profile" &&
        new URLSearchParams(location.searchStr).get("portal") === "permission"));
  const centralAdmin = canAccessAdminPortal(user.role, user.isSuperAdmin);
  const currentSystem = location.pathname.startsWith("/hrdo")
    ? "COE"
    : location.pathname.startsWith("/permission-slips")
      ? "Permission Slips"
      : location.pathname.startsWith("/receipts")
        ? "Receipts"
        : centralAdmin
          ? "LOA Systems"
          : "Vehicle Trip Ticket";
  const portalTitle = user.isSuperAdmin ? "Super Admin Portal" : "Admin Portal";
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => unwrap(listNotificationsFn()),
    staleTime: 15_000,
    enabled: !permissionPortal,
  });
  const unread = permissionPortal ? 0 : (notifications.data?.filter((n) => !n.read).length ?? 0);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await unwrap(logoutFn());
      queryClient.clear();
      window.location.replace("/#main-content");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't sign you out. Please try again.",
      );
      setSigningOut(false);
    }
  }
  return (
    <div className="flex min-h-screen">
      {signingOut && <LoadingScreen label="Signing out" mode="overlay" immediate />}
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 md:block">
        <SideNav user={user} unread={unread} permissionPortal={permissionPortal} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-card px-3 sm:px-5">
          <img
            src="/loa-logo.png"
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border bg-white object-contain p-0.5 md:hidden"
          />
          <span className="hidden truncate text-sm font-semibold md:inline">
            {permissionPortal
              ? "Permission Slip Portal"
              : centralAdmin
                ? location.pathname === "/admin"
                  ? portalTitle
                  : `${portalTitle} · ${currentSystem}`
                : `${ROLE_TITLES[user.role]} Portal`}
          </span>
          <span className="truncate text-sm font-semibold md:hidden">
            {permissionPortal ? "Permission Slip" : centralAdmin ? "Admin Portal" : "LOA VRTT"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {!permissionPortal && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={`Notifications, ${unread} unread`}
              >
                <Link to="/notifications" search={{ view: "list" }} className="relative">
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
                  )}
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <UserRound className="h-4 w-4" />
                  <span className="hidden max-w-[160px] truncate sm:inline">{user.name}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm">{user.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {user.email} · {user.isSuperAdmin ? "Super Admin" : ROLE_TITLES[user.role]}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    to="/profile"
                    search={{ portal: permissionPortal ? "permission" : undefined }}
                  >
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/privacy">Privacy Policy</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main-content" className="w-full flex-1 px-3 pb-24 pt-5 sm:px-6 md:pb-5">
          {children}
        </main>
      </div>
      <MobileNav user={user} unread={unread} permissionPortal={permissionPortal} />
    </div>
  );
}
