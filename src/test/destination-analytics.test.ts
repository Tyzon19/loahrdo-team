import { describe, expect, it } from "vitest";
import { aggregateDestinationTrips } from "@/lib/destination-analytics";

describe("destination trip analytics", () => {
  it("combines legacy address suffixes and casing under the common place name", () => {
    expect(
      aggregateDestinationTrips([
        { requestId: "1", destination: "Bulacan, Philippines" },
        { requestId: "2", destination: " bulacan " },
        { requestId: "3", destination: "BULACAN, Central Luzon" },
      ]),
    ).toEqual([{ name: "Bulacan", trips: 3 }]);
  });

  it("counts a multi-stop request once per destination and sorts by trip count", () => {
    expect(
      aggregateDestinationTrips([
        { requestId: "1", destination: "Bulacan" },
        { requestId: "1", destination: "Bulacan, Philippines" },
        { requestId: "1", destination: "Manila" },
        { requestId: "2", destination: "Manila" },
        { requestId: "3", destination: "   " },
      ]),
    ).toEqual([
      { name: "Manila", trips: 2 },
      { name: "Bulacan", trips: 1 },
    ]);
  });

  it("limits the chart data to twenty destinations", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      requestId: String(index),
      destination: `Location ${index}`,
    }));

    expect(aggregateDestinationTrips(rows)).toHaveLength(20);
  });
});
