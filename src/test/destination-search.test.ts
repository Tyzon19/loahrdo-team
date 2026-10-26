import { describe, expect, it } from "vitest";
import {
  combineDestinationSuggestions,
  normalizeDestination,
  photonSuggestions,
} from "@/lib/destination-search";
import { destinationSearchSchema } from "@/lib/validation";

describe("destination suggestions", () => {
  it("uses only the Philippine place name for the saved value", () => {
    const results = photonSuggestions({
      features: [
        {
          properties: {
            name: "Lyceum of Alabang",
            housenumber: "Km. 30",
            street: "National Road",
            city: "Muntinlupa",
            state: "Metro Manila",
            country: "Philippines",
            countrycode: "PH",
            osm_id: 123,
            osm_type: "W",
          },
          geometry: { coordinates: [121, 14] },
        },
      ],
    });

    expect(results).toEqual([
      {
        value: "Lyceum of Alabang",
        name: "Lyceum of Alabang",
        address: "Muntinlupa, Metro Manila",
        source: "photon",
        countryCode: "PH",
      },
    ]);
    expect(JSON.stringify(results)).not.toMatch(/coordinates|osm_id|osm_type/);
  });

  it("excludes international results and caps Philippine results at five", () => {
    const features = Array.from({ length: 7 }, (_, index) => ({
      properties: {
        name: `Place ${index}`,
        country: index === 6 ? "France" : "Philippines",
        countrycode: index === 6 ? "FR" : "PH",
      },
    }));
    const results = photonSuggestions({ features });

    expect(results).toHaveLength(5);
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.countryCode === "PH")).toBe(true);
    expect(
      photonSuggestions({ features: [{ properties: { name: "Paris", countrycode: "FR" } }] }),
    ).toEqual([]);
  });

  it("deduplicates saved and live destinations case-insensitively with normalized whitespace", () => {
    const result = combineDestinationSuggestions(
      ["  Festival   Mall, Alabang, Philippines ", "FESTIVAL MALL, Philippines"],
      [
        {
          value: "festival mall",
          name: "Festival Mall",
          address: "",
          source: "photon",
        },
        {
          value: "Alabang Town Center",
          name: "Alabang Town Center",
          address: "",
          source: "photon",
        },
      ],
    );

    expect(result.map((suggestion) => suggestion.value)).toEqual([
      "Festival Mall",
      "Alabang Town Center",
    ]);
    expect(normalizeDestination("  Festival   Mall ")).toBe("festival mall");
    expect(normalizeDestination("Bulacan, Philippines")).toBe("bulacan");
  });
});

describe("destination search validation", () => {
  it("requires three characters and limits search text", () => {
    expect(destinationSearchSchema.safeParse("ab").success).toBe(false);
    expect(destinationSearchSchema.safeParse(" SMX ").success).toBe(true);
    expect(destinationSearchSchema.safeParse("a".repeat(101)).success).toBe(false);
  });
});
