export interface DestinationSuggestion {
  value: string;
  name: string;
  address: string;
  source: "saved" | "photon";
  countryCode?: string;
}

function readable(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function shortDestinationName(value: string) {
  return value.split(",")[0]?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeDestination(value: string) {
  return shortDestinationName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ACRONYM_STOP_WORDS = new Set(["a", "an", "and", "of", "the", "sa", "ng"]);

export function destinationSearchScore(value: string, search: string): number {
  const name = normalizeDestination(value);
  const query = normalizeDestination(search);
  if (!name || !query) return 0;
  if (name === query) return 100;
  if (name.startsWith(query)) return 90;
  if (name.includes(query)) return 80;

  const words = name.split(" ");
  const queryWords = query.split(" ");
  if (queryWords.every((queryWord) => words.some((word) => word.startsWith(queryWord)))) {
    return 70;
  }

  const acronyms = [
    words.map((word) => word[0]).join(""),
    words
      .filter((word) => !ACRONYM_STOP_WORDS.has(word))
      .map((word) => word[0])
      .join(""),
  ];
  if (acronyms.includes(query)) return 65;
  if (acronyms.some((acronym) => acronym.startsWith(query))) return 60;
  return 0;
}

export function photonSuggestions(data: unknown): DestinationSuggestion[] {
  if (!data || typeof data !== "object" || !("features" in data) || !Array.isArray(data.features)) {
    return [];
  }

  const suggestions: DestinationSuggestion[] = [];
  for (const feature of data.features) {
    if (!feature || typeof feature !== "object" || !("properties" in feature)) continue;
    const rawProperties = feature.properties;
    if (!rawProperties || typeof rawProperties !== "object") continue;
    const properties = rawProperties as Record<string, unknown>;
    if (readable(properties["countrycode"]).toUpperCase() !== "PH") continue;

    const rawName =
      readable(properties["name"]) ||
      readable(properties["city"]) ||
      readable(properties["district"]) ||
      readable(properties["street"]);
    const name = shortDestinationName(rawName);
    if (!name) continue;

    const locality = readable(properties["city"]) || readable(properties["district"]);
    const address = [locality, readable(properties["state"])]
      .filter((part) => part && normalizeDestination(part) !== normalizeDestination(name))
      .filter(
        (part, index, all) =>
          all.findIndex((other) => normalizeDestination(other) === normalizeDestination(part)) ===
          index,
      )
      .join(", ");
    const value = name.slice(0, 200).trim();
    const suggestion: DestinationSuggestion = {
      value,
      name,
      address,
      source: "photon",
    };
    suggestion.countryCode = "PH";
    suggestions.push(suggestion);
  }

  const unique = new Map<string, DestinationSuggestion>();
  suggestions.forEach((suggestion) => {
    const key = normalizeDestination(suggestion.value);
    if (key && !unique.has(key)) unique.set(key, suggestion);
  });
  return [...unique.values()].slice(0, 5);
}

export function combineDestinationSuggestions(
  savedDestinations: string[],
  photonResults: DestinationSuggestion[],
): DestinationSuggestion[] {
  const unique = new Map<string, DestinationSuggestion>();
  const saved: DestinationSuggestion[] = [];
  for (const value of savedDestinations) {
    const name = shortDestinationName(value);
    const key = normalizeDestination(name);
    if (key && !unique.has(key)) {
      const suggestion = { value: name, name, address: "", source: "saved" as const };
      unique.set(key, suggestion);
      saved.push(suggestion);
    }
  }
  const prioritizedSaved = saved.slice(0, 3);
  const remainingSaved = saved.slice(3);
  const selected: DestinationSuggestion[] = [...prioritizedSaved];
  for (const suggestion of photonResults) {
    const key = normalizeDestination(suggestion.value);
    if (key && !selected.some((item) => normalizeDestination(item.value) === key)) {
      selected.push(suggestion);
    }
    if (selected.length === 5) break;
  }
  for (const suggestion of remainingSaved) {
    if (selected.length === 5) break;
    if (
      !selected.some(
        (item) => normalizeDestination(item.value) === normalizeDestination(suggestion.value),
      )
    ) {
      selected.push(suggestion);
    }
  }
  return selected;
}
