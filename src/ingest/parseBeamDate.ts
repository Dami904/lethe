/**
 * BEAM's `time_anchor` field is a "Month-DD-YYYY" string (e.g.
 * "March-15-2024"), confirmed live against real chat.json files in
 * mohammadtavakoli78/BEAM's 100K tier -- a different format from
 * LongMemEval's (see parseLongMemEvalDate.ts), so it gets its own parser
 * rather than a shared one that would need to guess which shape it's
 * looking at.
 */
const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

export function parseBeamDate(timeAnchor: string): string {
  const match = timeAnchor.match(/^([A-Za-z]+)-(\d{1,2})-(\d{4})$/);
  if (!match) {
    throw new Error(`Unrecognized BEAM time_anchor format: ${timeAnchor}`);
  }
  const [, monthName, day, year] = match;
  const month = MONTHS[monthName!.toLowerCase()];
  if (!month) {
    throw new Error(`Unrecognized month name in BEAM time_anchor: ${timeAnchor}`);
  }
  return `${year}-${month}-${day!.padStart(2, "0")}T00:00:00.000Z`;
}
