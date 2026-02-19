const SUFFIX_MAP: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  ROAD: "RD",
  DRIVE: "DR",
  COURT: "CT",
  LANE: "LN",
  PLACE: "PL",
  BOULEVARD: "BLVD",
  CIRCLE: "CIR",
  TERRACE: "TER",
  TRAIL: "TRL",
  HIGHWAY: "HWY",
  PARKWAY: "PKWY",
  WAY: "WAY",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};

export function normalizeAddress(raw: string): string {
  let addr = raw.toUpperCase().trim();

  // collapse whitespace
  addr = addr.replace(/\s+/g, " ");

  // remove punctuation except spaces
  addr = addr.replace(/[^A-Z0-9 ]/g, "");

  // normalize suffixes
  const words = addr.split(" ");
  const normalized = words.map((w) => SUFFIX_MAP[w] || w);

  return normalized.join(" ");
}
