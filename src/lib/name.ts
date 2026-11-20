export function splitFullName(value: string) {
  const trimmed = value.trim();
  const prefixMatch = trimmed.match(/^(Mr\.?|Ms\.?|Mrs\.?|Mx\.?|Dr\.?|Atty\.?)\s+/i);
  const prefix = prefixMatch ? `${prefixMatch[1]?.replace(/\.$/, "")}.` : "";
  const parts = trimmed
    .replace(/^(?:Mr\.?|Ms\.?|Mrs\.?|Mx\.?|Dr\.?|Atty\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return { prefix, firstName: "", middleName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { prefix, firstName: parts[0] ?? "", middleName: "", lastName: "" };
  }

  if (parts.length === 2) {
    return { prefix, firstName: parts[0] ?? "", middleName: "", lastName: parts[1] ?? "" };
  }

  return {
    prefix,
    firstName: parts[0] ?? "",
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

export const FORMAL_NAME_PREFIXES = ["Mr.", "Ms.", "Mrs.", "Mx.", "Dr.", "Atty."] as const;

export function joinFullName(input: { firstName: string; middleName?: string; lastName: string }) {
  return [input.firstName, input.middleName, input.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
