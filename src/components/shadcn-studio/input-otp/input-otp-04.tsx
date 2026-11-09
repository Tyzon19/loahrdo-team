import { useEffect, useId, useState } from "react";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

type InputOTPWithResendTimerProps = {
  value: string;
  onChange: (value: string) => void;
  onResend: () => void | Promise<void>;
  disabled?: boolean;
};

export default function InputOTPWithResendTimer({
  value,
  onChange,
  onResend,
  disabled = false,
}: InputOTPWithResendTimerProps) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [resending, setResending] = useState(false);
  const id = useId();

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = window.setTimeout(() => setTimeLeft((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [timeLeft]);

  async function handleResend() {
    if (resending || disabled) return;
    setResending(true);
    try {
      await onResend();
      setTimeLeft(60);
    } finally {
      setResending(false);
    }
  }
  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const seconds = (timeLeft % 60).toString().padStart(2, "0");

  return (
    <div className="space-y-3">
      <Label htmlFor={id}>Six-digit recovery code</Label>
      <InputOTP
        id={id}
        maxLength={6}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete="one-time-code"
        containerClassName="w-full justify-between gap-1.5 sm:gap-2"
      >
        <InputOTPGroup className="w-full justify-between gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              className="h-12 w-full rounded-md border text-base font-semibold first:rounded-md first:border last:rounded-md sm:h-14"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Enter the code sent to your email.</span>
        {timeLeft > 0 ? (
          <span className="shrink-0 tabular-nums">
            Resend in {minutes}:{seconds}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || disabled}
            className="shrink-0 font-medium text-primary underline-offset-4 hover:underline"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </div>
    </div>
  );
}
