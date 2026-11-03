import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  BusFront,
  ChevronDown,
  CircleHelp,
  FileBadge,
  FileText,
  FolderKanban,
  Phone,
  ShieldCheck,
  Mail,
  Facebook,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canonical } from "@/lib/site";

const popularServices = [
  {
    title: "Vehicle Reservation",
    icon: BusFront,
    to: "/login",
  },
  {
    title: "COE Request",
    icon: FileBadge,
    to: "/hrdo/coe",
  },
  {
    title: "Permission Slip",
    icon: FolderKanban,
    to: "/hrdo/requests",
  },
  {
    title: "Late & Absences",
    icon: BriefcaseBusiness,
    to: "/hrdo/history",
  },
  {
    title: "Employee Records",
    icon: ShieldCheck,
    to: "/hrdo/profile",
  },
  {
    title: "View All Services",
    icon: CircleHelp,
    to: "/hrdo/dashboard",
    highlight: true,
  },
] as const satisfies Array<{
  title: string;
  icon: LucideIcon;
  to: string;
  highlight?: boolean;
}>;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LOA HRDO eServices" },
      {
        name: "description",
        content: "HRDO eServices portal for employee requests, official documents, and office services.",
      },
      { property: "og:title", content: "LOA HRDO eServices" },
      {
        property: "og:description",
        content: "A digital employee services portal for faster, smarter, and more convenient HRDO access.",
      },
      { property: "og:url", content: canonical("/") },
    ],
    links: [{ rel: "canonical", href: canonical("/") }],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#222] antialiased">
      <header className="sticky top-0 z-30 border-b border-[#e1edf7] bg-white/95 backdrop-blur-sm shadow-[0_1px_0_rgba(10,44,79,0.04)]">
        <div className="mx-auto flex h-[95px] max-w-[1340px] items-center justify-between gap-5 px-6">
          <div className="flex items-center gap-3">
            <img
              src="/loa-loading.png"
              alt="LOA eServices logo"
              className="h-[200px] w-[200px] object-contain"
            />
          </div>

          <div className="flex items-center gap-6">
            <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
              <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[15px] font-semibold uppercase tracking-[0.01em] text-[#0F5C85] transition-colors hover:text-[#0b4670]"
                >
                  <span>Services</span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <div className="absolute right-0 top-full z-20 mt-3 hidden min-w-[240px] rounded-md border border-[#dfeaf3] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
                  {[
                    { label: "Vehicle Trip Ticketing", href: "/login" },
                    { label: "COE Request", href: "/hrdo/coe" },
                    { label: "Permission Slip", href: "/hrdo/requests" },
                    { label: "Late & Absences", href: "/hrdo/history" },
                    { label: "Employee Records", href: "/hrdo/profile" },
                    { label: "HRDO Dashboard", href: "/hrdo/dashboard" },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      className="block rounded-sm px-3 py-2 text-left text-[14px] font-medium text-[#0F5C85] transition-colors hover:bg-[#eef7ff] hover:text-[#0b4670]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>

              <Link
                to="/hrdo/dashboard"
                className="text-[15px] font-semibold uppercase tracking-[0.01em] text-[#0F5C85] transition-colors hover:text-[#0b4670]"
              >
                About
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                to="/register"
                className="inline-flex h-[37px] items-center justify-center rounded-[6px] bg-[#0F5C85] px-5 text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-[#0b4d76]"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="relative h-[548px] overflow-hidden bg-[#d8ebf8]">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: "url('/lyceum-building.png.png')",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,44,59,0.72)_0%,rgba(29,93,127,0.45)_38%,rgba(126,179,218,0.24)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.04))]" />

          <svg
            aria-hidden="true"
            className="absolute left-0 top-0 h-full w-[42%] opacity-75"
            viewBox="0 0 760 548"
            preserveAspectRatio="none"
          >
            <polygon points="0,0 760,0 760,548 0,548 0,450 120,430 160,350 220,250 300,180 430,170 610,240 700,220 760,200 760,0" fill="rgba(255,255,255,0.07)" />
          </svg>

          <svg
            aria-hidden="true"
            className="absolute bottom-[-28px] left-[-4%] h-[170px] w-[108%]"
            viewBox="0 0 1600 220"
            preserveAspectRatio="none"
          >
            <path
              d="M0,128 L60,114 L130,118 L210,110 L310,120 L430,100 L520,110 L620,82 L760,96 L860,70 L960,102 L1040,84 L1120,98 L1190,72 L1290,94 L1380,84 L1480,100 L1600,90 L1600,220 L0,220 Z"
              fill="rgba(13,123,181,0.92)"
            />
          </svg>

          <div className="relative mx-auto flex h-full max-w-[1340px] items-start px-6">
            <div className="max-w-[680px] pt-[180px] text-white">
              <p className="mb-4 text-[40px] font-medium uppercase tracking-[-0.04em] text-white/95">
                Welcome to
              </p>
              <h1 className="mb-5 text-[57px] font-bold leading-[1.08] tracking-[-0.04em] text-white">
                LOA HRDO DESK
              </h1>
              <p className="max-w-[680px] text-[28px] font-normal leading-[1] text-white/95">
                Transforming employee services for a faster, convenient, and smarter digital experience for staff and stakeholders.
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1340px] px-6">
          <div className="flex items-center gap-3 py-[26px] text-[16px] font-semibold text-[#0F5C85]">
            <a href="#" className="font-bold uppercase underline decoration-2 underline-offset-4">
              Explore our services
            </a>
          </div>

          <section className="pt-1">
            <h2 className="pb-[16px] text-[22px] font-semibold text-[#444]">Our Services</h2>

            <div className="grid grid-cols-1 gap-x-[30px] gap-y-[16px] md:grid-cols-2 xl:grid-cols-3">
              {popularServices.map(({ title, icon: Icon, highlight, to }) => {
                const isHighlighted = highlight;
                return (
                  <Link
                    key={title}
                    to={to}
                    className={`group flex h-[136px] flex-col items-center justify-center rounded-[10px] border border-[#7DBDEB] bg-white px-4 py-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                      isHighlighted ? "bg-[#0F5C85] text-white" : "bg-white text-[#0F5C85]"
                    }`}
                  >
                    <div
                      className={`mb-4 flex h-[80px] w-[80px] items-center justify-center rounded-[12px] ${
                        isHighlighted ? "bg-[rgba(255,255,255,0.14)]" : "bg-[#D6E9F8]"
                      }`}
                    >
                      <Icon
                        className={`h-[44px] w-[44px] ${isHighlighted ? "text-white" : "text-[#0F5C85]"}`}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </div>
                    <div
                      className={`text-[17px] font-bold ${isHighlighted ? "text-white" : "text-[#0F5C85]"}`}
                    >
                      {title}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

        </div>
      </main>

      <footer className="mt-[48px] bg-gradient-to-r from-[#135F87] via-[#155d86] to-[#1B6A92] text-white">
        <div className="mx-auto max-w-[1340px] px-6 py-[18px]">
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[14px] font-bold uppercase tracking-[0.08em]">Follow us</span>
              <div className="flex items-center gap-3">
                <a
                  href="https://www.facebook.com/lyceumhrdo"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Lyceum HRDO Facebook"
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/70 bg-white/10 text-white transition-colors hover:bg-white/15"
                >
                  <Facebook className="h-[18px] w-[18px]" aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[15px] font-medium text-white">
              <div className="flex items-center gap-2">
                <Phone className="h-[16px] w-[16px]" aria-hidden="true" />
                <span>156</span>
              </div>
              <div className="h-[30px] w-px bg-white/40" />
              <div className="flex items-center gap-2">
                <Mail className="h-[16px] w-[16px]" aria-hidden="true" />
                <span>hrdo@lyceumalabang.edu.ph</span>
              </div>
            </div>

            <nav aria-label="Footer links" className="flex items-center gap-6 text-[14px] font-bold uppercase tracking-[0.02em] text-white">
              <a href="/privacy" className="transition-opacity hover:opacity-80">
                Terms of Service
              </a>
              <a href="#faqs" className="transition-opacity hover:opacity-80">
                FAQs
              </a>
              <a href="/privacy" className="transition-opacity hover:opacity-80">
                Privacy Policy
              </a>
            </nav>
          </div>

          <div id="faqs" className="mt-4 h-px w-full bg-white/30" />
          <div id="privacy-policy" className="pt-3 text-center text-[12px] text-white/85">
            © 2025 Lyceum of Alabang HRDO. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
