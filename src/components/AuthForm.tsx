import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CircleCheck, Eye, EyeOff, Facebook, LoaderCircle, type LucideIcon } from "lucide-react";

const FACEBOOK_URL = "https://www.facebook.com/lyceumhrdo";
const LOGO_URL = "/loa-loading.png";

export function AuthShell({
  heading,
  hint,
  children,
}: {
  heading: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="module-login-shell">
      <section className="module-login-brand" aria-hidden="true">
        <div className="module-login-cityscape" />
      </section>

      <section className="module-login-account" aria-labelledby="auth-heading">
        <div className="module-login-account-content">
          <img src={LOGO_URL} alt="Lyceum of Alabang" className="module-login-register-logo" />

          <header className="module-login-form-heading">
            <h2 id="auth-heading">{heading}</h2>
          </header>

          {hint ? <p className="module-auth-hint">{hint}</p> : null}

          {children}

          <div className="module-login-footer">
            <p>For inquiries and comments please send us a message at info@lyceumalabang.edu.ph.</p>
            <p>
              Copyright © 2026 Lyceum of Alabang.
              <br />
              All rights reserved.
            </p>
            <div>
              <Link to="/privacy">Privacy Policy</Link>
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                className="module-auth-social"
                aria-label="Follow us on Facebook"
              >
                Follow us
                <Facebook className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
  label: string;
  error?: string | undefined;
};

export function AuthField({ icon: Icon, label, error, id, type, ...props }: AuthFieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="module-login-field">
      <label htmlFor={id}>{label}</label>
      <div className="module-auth-input">
        <Icon className="module-auth-field-icon" aria-hidden="true" />
        <input
          {...props}
          id={id}
          type={isPassword && show ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && id ? `${id}-error` : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="module-login-password-toggle"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            onClick={() => setShow((current) => !current)}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p className="module-auth-error" id={id ? `${id}-error` : undefined} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthCaptcha() {
  const [checked, setChecked] = useState(false);

  return (
    <label className="module-login-captcha">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <span>I&apos;m not a robot</span>
      <small>reCAPTCHA</small>
    </label>
  );
}

export function AuthSubmit({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <button type="submit" className="module-login-submit" disabled={busy}>
      {busy ? (
        <span className="module-auth-busy">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function AuthAlert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  const Icon = tone === "success" ? CircleCheck : AlertCircle;

  return (
    <div className={`module-auth-alert module-auth-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-2 3.01v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.34Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59A6.01 6.01 0 0 1 12 5.97Z"
      />
    </svg>
  );
}
