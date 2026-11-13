import type { ZodIssue } from "zod";

function isDefaultMessage(issue: ZodIssue, prefix: string) {
  return issue.message.startsWith(prefix);
}

function minimumMessage(issue: Extract<ZodIssue, { code: "too_small" }>) {
  if (!isDefaultMessage(issue, "Too small:")) return issue.message;

  if (issue.origin === "string" && typeof issue.minimum === "number") {
    if (issue.exact) return `Enter exactly ${issue.minimum} characters.`;
    return issue.inclusive === false
      ? `Enter more than ${issue.minimum} characters.`
      : `Enter at least ${issue.minimum} characters.`;
  }
  if ((issue.origin === "array" || issue.origin === "set") && typeof issue.minimum === "number") {
    const count = issue.minimum;
    return `Add at least ${count} item${count === 1 ? "" : "s"}.`;
  }
  if (
    (issue.origin === "number" || issue.origin === "int" || issue.origin === "bigint") &&
    typeof issue.minimum === "number"
  ) {
    if (issue.exact) return `Enter exactly ${issue.minimum}.`;
    return issue.inclusive === false
      ? `Enter a value greater than ${issue.minimum}.`
      : `Enter a value of at least ${issue.minimum}.`;
  }
  if (issue.origin === "date") return "Choose a later date.";
  if (issue.origin === "file") return "Choose a larger file.";
  return "Enter a value that meets the minimum requirement.";
}

function maximumMessage(issue: Extract<ZodIssue, { code: "too_big" }>) {
  if (!isDefaultMessage(issue, "Too big:")) return issue.message;

  if (issue.origin === "string" && typeof issue.maximum === "number") {
    if (issue.exact) return `Enter exactly ${issue.maximum} characters.`;
    return issue.inclusive === false
      ? `Enter fewer than ${issue.maximum} characters.`
      : `Use ${issue.maximum} characters or fewer.`;
  }
  if ((issue.origin === "array" || issue.origin === "set") && typeof issue.maximum === "number") {
    const count = issue.maximum;
    return `Choose no more than ${count} item${count === 1 ? "" : "s"}.`;
  }
  if (
    (issue.origin === "number" || issue.origin === "int" || issue.origin === "bigint") &&
    typeof issue.maximum === "number"
  ) {
    if (issue.exact) return `Enter exactly ${issue.maximum}.`;
    return issue.inclusive === false
      ? `Enter a value less than ${issue.maximum}.`
      : `Enter a value of ${issue.maximum} or less.`;
  }
  if (issue.origin === "date") return "Choose an earlier date.";
  if (issue.origin === "file") return "Choose a smaller file.";
  return "Enter a value that meets the maximum requirement.";
}

export function validationIssueMessage(issue: ZodIssue) {
  switch (issue.code) {
    case "too_small":
      return minimumMessage(issue);
    case "too_big":
      return maximumMessage(issue);
    case "invalid_type":
      return isDefaultMessage(issue, "Invalid input: expected")
        ? "Enter a valid value."
        : issue.message;
    case "invalid_value":
      return isDefaultMessage(issue, "Invalid option: expected")
        ? "Choose a valid option."
        : issue.message;
    case "invalid_union":
      return issue.message === "Invalid input" ? "Enter a valid value." : issue.message;
    case "invalid_format":
      return isDefaultMessage(issue, "Invalid string:")
        ? "Use the requested format."
        : issue.message;
    case "not_multiple_of":
      return isDefaultMessage(issue, "Invalid number: must be a multiple of")
        ? `Enter a multiple of ${issue.divisor}.`
        : issue.message;
    case "unrecognized_keys":
      return isDefaultMessage(issue, "Unrecognized key")
        ? "Remove unsupported information and try again."
        : issue.message;
    case "invalid_key":
    case "invalid_element":
      return isDefaultMessage(issue, "Invalid ") ? "Enter a valid value." : issue.message;
    default:
      return issue.message;
  }
}
