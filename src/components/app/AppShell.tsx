import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BarChart3,
  Car,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Role, Viewer } from "@/lib/types";
import { ROLE_TITLES } from "@/lib/workflow";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listNotificationsFn, logoutFn } from "@/server-functions";
import { unwrap } from "@/lib/api";
type NavItem = { to: string; label: string; icon: typeof Bell; exact?: boolean };
const ITEMS = {
  dash: { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  newReq: { to: "/requests/new", label: "New Vehicle Request", icon: FilePlus2 },
  myReq: { to: "/requests", label: "My Requests", icon: ClipboardList, exact: true },
  req: { to: "/requests", label: "Requests", icon: ClipboardList, exact: true },
  vehicles: { to: "/vehicles", label: "Vehicles", icon: Car },
  notif: { to: "/notifications", label: "Notifications", icon: Bell },
  profile: { to: "/profile", label: "Profile", icon: UserRound },
  profileSettings: { to: "/profile", label: "Profile & Settings", icon: UserRound },
  tripArchive: { to: "/trip-archive", label: "Trip Archive & Analytics", icon: BarChart3 },
} satisfies Record<string, NavItem>;
export const NAV: Record<Role, NavItem[]> = {
  requisitioner: [ITEMS.dash, ITEMS.newReq, ITEMS.myReq, ITEMS.notif, ITEMS.profile],
  transport_head: [ITEMS.dash, ITEMS.req, ITEMS.vehicles, ITEMS.notif, ITEMS.profile],
  director: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.profile],
  president: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.profile],
  transport_staff: [ITEMS.dash, ITEMS.vehicles, ITEMS.req, ITEMS.notif, ITEMS.profile],
  assistant: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.profile],
  guard: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.profile],
  driver: [ITEMS.dash, ITEMS.req, ITEMS.notif, ITEMS.profile],
  admin: [ITEMS.dash, ITEMS.req, ITEMS.vehicles, ITEMS.tripArchive, ITEMS.notif, ITEMS.profileSettings],
};
function SideNav({ user, unread, onNavigate }: { user: Viewer; unread: number; onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground" aria-label="Main">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-sm font-semibold leading-tight text-sidebar-accent-foreground">
          Lyceum of Alabang
        </p>
        <p className="text-xs opacity-80">Vehicle Reservation &amp; Trip Ticket</p>
      </div>
      <ul className="flex-1 py-2">
        {NAV[user.role].map((item) => {
          const active = item.exact
            ? path === item.to || path === item.to + "/"
            : path.startsWith(item.to);
          return (
            <li key={item.to + item.label}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 border-l-4 px-4 py-2 text-sm transition-colors",
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
          );
        })}
      </ul>
      <div className="border-t border-sidebar-border px-4 py-3 text-xs opacity-80">
        <p>PFMO · Lyceum of Alabang</p>
        <Link to="/privacy" onClick={onNavigate} className="mt-1 inline-flex items-center gap-1 hover:underline">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Privacy Policy
        </Link>
      </div>
    </nav>
  );
}
export function AppShell({ user, children }: { user: Viewer; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => unwrap(listNotificationsFn()),
    staleTime: 15_000,
  });
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0;

  async function signOut() {
    await logoutFn();
    queryClient.clear();
    await router.invalidate();
    navigate({ to: "/login" });
  }
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 md:block">
        <SideNav user={user} unread={unread} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SideNav user={user} unread={unread} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-card px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="truncate text-sm font-medium">{ROLE_TITLES[user.role]} Portal</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`}>
              <Link to="/notifications" className="relative">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
                )}
              </Link>
            </Button>
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
                    {user.email} · {ROLE_TITLES[user.role]}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">Profile</Link>
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
        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}