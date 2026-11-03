import * as React from "react";

import { cn } from "@/lib/utils";

const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("grid gap-2", className)} {...props} />
  ),
);
Field.displayName = "Field";

const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none text-foreground", className)}
      {...props}
    />
  ),
);
FieldLabel.displayName = "FieldLabel";

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
FieldDescription.displayName = "FieldDescription";

type FieldErrorProps = React.HTMLAttributes<HTMLParagraphElement> & {
  errors?: Array<{ message?: string } | null | undefined>;
};

const FieldError = React.forwardRef<HTMLParagraphElement, FieldErrorProps>(
  ({ className, errors, ...props }, ref) => {
    const message = errors?.find((error) => error?.message)?.message;

    if (!message) {
      return null;
    }

    return (
      <p ref={ref} className={cn("text-sm font-medium text-destructive", className)} {...props}>
        {message}
      </p>
    );
  },
);
FieldError.displayName = "FieldError";

export { Field, FieldLabel, FieldDescription, FieldError };
