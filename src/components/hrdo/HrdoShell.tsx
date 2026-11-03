import type { ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ClipboardList,
  FileBadge,
  History,
  LayoutDashboard,
  LogOut,
  UserRound,
} from "lucide-react";
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
import { hrdoLogoutFn } from "@/server-functions";
import type { HrdoViewer } from "@/lib/hrdo";

type NavItem = {
  to: string;
  label: string;
  mobileLabel: string;
  icon: typeof LayoutDashboard;
  /** Extra path prefixes that should highlight this item (e.g. a detail route). */
  alsoStartsWith?: string[];
};

function navItems(user: HrdoViewer): NavItem[] {
  if (user.role === "hrdo_staff") {
    return [
      {
        to: "/hrdo/dashboard",
        label: "Dashboard",
        mobileLabel: "Overview",
        icon: LayoutDashboard,
      },
      {
        to: "/hrdo/requests",
        label: "COE Requests",
        mobileLabel: "Requests",
        icon: ClipboardList,
        alsoStartsWith: ["/hrdo/coe/"],
      },
      { to: "/hrdo/history", label: "Request History", mobileLabel: "History", icon: History },
      { to: "/hrdo/profile", label: "Profile", mobileLabel: "Profile", icon: UserRound },
    ];
  }
  return [
    {
      to: "/hrdo/dashboard",
      label: "My COE Requests",
      mobileLabel: "COE",
      icon: LayoutDashboard,
      alsoStartsWith: ["/hrdo/coe/"],
    },
    {
      to: "/hrdo/coe",
      label: "New COE Request",
      mobileLabel: "Request",
      icon: FileBadge,
    },
    { to: "/hrdo/profile", label: "Profile", mobileLabel: "Profile", icon: UserRound },
  ];
}

function isActive(item: NavItem, path: string) {
  if (path === item.to || path.startsWith(item.to + "/")) return true;
  return (item.alsoStartsWith ?? []).some((prefix) => path.startsWith(prefix));
}

function SideNav({
  user,
  items,
  onNavigate,
}: {
  user: HrdoViewer;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const path = useRouterState({ select: (router) => router.location.pathname });
  return (
    <nav
      className="flex h-full flex-col bg-sidebar text-sidebar-foreground"
      aria-label="HRDO navigation"
    >
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <img src="/loa-logo.png" alt="Lyceum of Alabang logo" className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-1" />
            <img src="/HRDO%20LOGO.png" alt="HRDO logo" className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-1" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-sidebar-accent-foreground">
              Lyceum of Alabang
            </p>
            <p className="text-xs opacity-80">HRDO Certificate of Employment</p>
          </div>
        </div>
      </div>
      <ul className="flex-1 py-2">
        {items.map((item) => {
          const active = isActive(item, path);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 border-l-4 px-4 py-2 text-sm transition-colors",
                  active
                    ? "border-sidebar-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-sidebar-border px-4 py-3 text-xs opacity-80">
        <p>HRDO · Lyceum of Alabang</p>
        <p className="mt-1 truncate">{user.department || "Employee"}</p>
      </div>
    </nav>
  );
}

function MobileNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = useRouterState({ select: (router) => router.location.pathname });
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      aria-label="HRDO mobile navigation"
    >
      <ul className="mx-auto grid w-full max-w-lg grid-flow-col auto-cols-fr gap-1">
        {items.map((item) => {
          const active = isActive(item, path);
          return (
            <li key={item.to} className="min-w-0">
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium leading-tight transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate">{item.mobileLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function HrdoShell({ user, children }: { user: HrdoViewer; children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const items = navItems(user);

  async function signOut() {
    await hrdoLogoutFn();
    queryClient.clear();
    await router.invalidate();
    navigate({ to: "/hrdo/login" });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 md:block">
        <SideNav user={user} items={items} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-card px-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            <img
              src="/loa-logo.png"
              alt="Lyceum of Alabang logo"
              className="h-8 w-8 shrink-0 rounded-full border bg-white object-contain p-0.5 md:hidden"
            />
            <img
              src="/HRDO%20LOGO.png"
              alt="HRDO logo"
              className="h-8 w-8 shrink-0 rounded-full border bg-white object-contain p-0.5 md:hidden"
            />
          </div>
          <span className="truncate text-sm font-semibold">
            {user.role === "hrdo_staff" ? "HRDO Staff Portal" : "Employee Portal"}
          </span>
          <div className="ml-auto flex items-center gap-1">
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
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/hrdo/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/hrdo/dashboard">
                    {user.role === "hrdo_staff" ? "COE Dashboard" : "My COE Requests"}
                  </Link>
                </DropdownMenuItem>
                {user.role === "hrdo_staff" && (
                  <DropdownMenuItem asChild>
                    <Link to="/hrdo/requests">COE Requests</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          className="w-full flex-1 px-3 pb-24 pt-5 sm:px-6 md:pb-5"
        >
          {children}
        </main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}
