/**
 * A generated race's id: `gen-[<rival>-]<seed>[-circuit|-unordered]`. The seed
 * draws the gates, the variant turns the sprint into a circuit or unordered
 * checkpoints, and the rival, when there is one, is the turf the draw leans
 * toward (`alder-turf.ts`). `gen-15` is a draw with no turf and always will be,
 * so ids stored before turfs existed still name the race they named.
 *
 * One grammar, parsed here, so the URL, Moth's career and the playlist cannot
 * drift apart. No dependencies: sim and settings both import it.
 */
export type GeneratedKind = "sprint" | "circuit" | "unordered";
export interface GeneratedRaceId { seed: number; kind: GeneratedKind; rival: string | null }

const GRAMMAR = /^gen-(?:([a-z]{2,16})-)?(\d{1,9})(?:-(circuit|unordered))?$/;

export function generatedRaceId({ seed, kind, rival }: GeneratedRaceId): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > 999_999_999) throw new RangeError(`Seed ${seed} is not a race seed`);
  if (rival !== null && !/^[a-z]{2,16}$/.test(rival)) throw new RangeError(`Rival '${rival}' cannot name a race`);
  return `gen-${rival === null ? "" : `${rival}-`}${seed}${kind === "sprint" ? "" : `-${kind}`}`;
}

export function parseGeneratedRaceId(id: string): GeneratedRaceId | null {
  const match = GRAMMAR.exec(id);
  if (!match) return null;
  // "circuit" and "unordered" are variants, never rivals: gen-circuit-5 is not a race.
  if (match[1] === "circuit" || match[1] === "unordered") return null;
  return { seed: Number(match[2]), kind: (match[3] ?? "sprint") as GeneratedKind, rival: match[1] ?? null };
}
