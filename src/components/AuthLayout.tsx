import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Facebook, type LucideIcon } from "lucide-react";

export const FACEBOOK_URL = "https://www.facebook.com/lyceumhrdo";
export const LOGO_URL = "https://lyceumalabang.edu.ph/wp-content/uploads/2025/08/logo-blk.png";

export function AuthLayout({
  title,
  children,
  back = false,
  backTo = "/login",
  centered = false,
  showImage = true,
}: {
  title: string;
  children: ReactNode;
  back?: boolean;
  backTo?: "/login" | "/hrdo/login";
  centered?: boolean;
  showImage?: boolean;
}) {
  return (
    <div
      className={`auth-layout flex min-h-screen bg-background ${centered ? "justify-center" : ""}`}
    >
      <aside
        className={`flex w-full flex-col justify-center overflow-y-auto px-4 py-10 sm:px-9 ${
          centered ? "md:w-[560px]" : "md:w-[480px] md:shrink-0"
        }`}
      >
        {back && (
          <Link
            to={backTo}
            className="mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Sign In
          </Link>
        )}
        <div className="mx-auto mb-6 flex items-center justify-center gap-3">
          <img
            src={LOGO_URL}
            alt="Lyceum of Alabang"
            className="h-20 w-auto max-w-[190px] object-contain"
          />
          <img
            src="/HRDO%20LOGO.png"
            alt="Human Resources Development Office"
            className="h-12 w-12 object-contain"
          />
        </div>
        <h1 className="mb-6 text-xl font-bold uppercase text-primary">{title}</h1>
        {children}
        <div className="mt-14 space-y-3 text-sm text-muted-foreground">
          <p>For inquiries and comments please send us a message at https://www.facebook.com/lyceumhrdo</p>
          <p>
            Copyright © 2026 Lyceum of Alabang.
            <br />
            All rights reserved.
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm">
          <Link to="/terms-of-service" className="font-medium text-primary hover:underline">
            Terms of Service
          </Link>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Message us</span>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Follow us on Facebook"
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary transition-colors hover:text-primary/80"
            >
              <Facebook className="h-5 w-5" />
            </a>
          </div>
        </div>
      </aside>
      {showImage && (
        <div className="relative hidden flex-1 md:block">
          <img
            src="/lyceum-building.png.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover grayscale"
          />
          <div className="absolute inset-0 bg-overlay mix-blend-multiply" />
          <div className="absolute inset-0 bg-overlay/40" />
        </div>
      )}
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon };

export function Field({ icon: Icon, type, ...props }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="mb-3 flex items-center gap-4 border-b border-primary px-3 py-3">
      <Icon className="h-5 w-5 shrink-0 fill-primary text-primary" />
      <input
        {...props}
        type={isPassword && show ? "text" : type}
        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((current) => !current)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </label>
  );
}

export function SubmitButton({
  icon: Icon,
  children,
  disabled = false,
}: {
  icon: LucideIcon;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium uppercase text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

export function SubmitButtonWithSpinner({
  icon: Icon,
  children,
  busy = false,
}: {
  icon: LucideIcon;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium uppercase text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

export function FakeCaptcha() {
  const [checked, setChecked] = useState(false);
  return (
    <div className="mx-auto my-2 flex w-full max-w-[302px] items-center justify-between rounded-sm border border-border bg-muted px-3 py-4 shadow-sm">
      <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="h-6 w-6"
        />
        I&apos;m not a robot
      </label>
      <span className="text-[10px] text-muted-foreground">reCAPTCHA</span>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-3 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-background py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-2 3.01v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.34Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
        />
        <path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z" />
        <path
          fill="#EA4335"
          d="M12 5.97c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59A6.01 6.01 0 0 1 12 5.97Z"
        />
      </svg>
      {label}
    </a>
  );
}
