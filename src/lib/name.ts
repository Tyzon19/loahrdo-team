export function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { firstName: "", middleName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], middleName: "", lastName: "" };
  }

  if (parts.length === 2) {
    return { firstName: parts[0], middleName: "", lastName: parts[1] };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

export function joinFullName(input: {
  firstName: string;
  middleName?: string;
  lastName: string;
}) {
  return [input.firstName, input.middleName, input.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
