import { describe, expect, it } from "vitest";
import { parseBeamDate } from "../src/ingest/parseBeamDate.js";

describe("parseBeamDate", () => {
  it("parses a real BEAM time_anchor into ISO 8601 UTC", () => {
    expect(parseBeamDate("March-15-2024")).toBe("2024-03-15T00:00:00.000Z");
  });

  it("pads a single-digit day", () => {
    expect(parseBeamDate("May-2-2024")).toBe("2024-05-02T00:00:00.000Z");
  });

  it("is case-insensitive on the month name", () => {
    expect(parseBeamDate("november-25-2024")).toBe("2024-11-25T00:00:00.000Z");
  });

  it("throws on an unrecognized format rather than silently misparsing", () => {
    expect(() => parseBeamDate("2024-03-15")).toThrow();
  });

  it("throws on an unrecognized month name", () => {
    expect(() => parseBeamDate("Marchember-15-2024")).toThrow();
  });
});
