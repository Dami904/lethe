/**
 * LongMemEval timestamps look like "2023/03/11 (Sat) 07:01" -- this parses
 * that into ISO 8601 (UTC), which is what every Lethe endpoint expects.
 */
export function parseLongMemEvalDate(raw: string): string {
  const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2}) \([A-Za-z]{3}\) (\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Unrecognized LongMemEval date format: "${raw}"`);
  }
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`;
}
