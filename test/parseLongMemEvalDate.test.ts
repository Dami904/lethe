import { describe, expect, it } from "vitest";
import { parseLongMemEvalDate } from "../src/ingest/parseLongMemEvalDate.js";

describe("parseLongMemEvalDate", () => {
  it("parses a real LongMemEval timestamp into ISO 8601 UTC", () => {
    expect(parseLongMemEvalDate("2023/03/11 (Sat) 07:01")).toBe("2023-03-11T07:01:00.000Z");
  });

  it("throws on an unrecognized format rather than silently misparsing", () => {
    expect(() => parseLongMemEvalDate("March 11, 2023")).toThrow();
  });
});
