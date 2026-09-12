import { RIVET } from "../sim/drag-event.ts";
import { SABLE } from "../sim/drift-yard.ts";
import { MOTH } from "../sim/encounter.ts";

/**
 * The contact card the HUD shows when a rival is close enough to flash: their
 * face, their name, what they drive and where, and what you are agreeing to.
 * Rivals are driving personalities (GDD §3.3) and the portrait is how one
 * becomes somebody; the rules the faces are drawn to are in
 * `design/CHARACTERS.md`, and the served portraits come from the masters
 * beside them via `scripts/character-sheet.py`.
 *
 * Nothing here draws and nothing here decides: the sim names the rival, this
 * module says what the card reads, and main.ts writes it into the DOM.
 *
 * The card carries no per-rival accent colour yet. `design/CHARACTERS.md` says
 * the accent is the rival's car's, but that does not survive contact with the
 * cars: the Hammer and the Kestrel are both cream, the Hammer's stated
 * fallback secondary is satin black (invisible on this panel), and Sable's
 * NS-01 was repainted teal so it could not be confused with the player's, which
 * is fixed: it is his outright now, in the signal red his portrait describes.
 * The Hammer and Kestrel are still both cream, so the rule still cannot be
 * followed for Rivet and Moth. The face
 * is the identity at this size, so the card leads with it and the edge stays
 * the one rival colour until the car colours are settled.
 */

export interface RivalCard {
  readonly id: string;
  readonly name: string;
  /** What they drive. The name on the card is the name in the sim. */
  readonly car: string;
  /** The turf that places them, in the fewest words that work on the map. */
  readonly turf: string;
  /** The event, short enough to read at a roll. */
  readonly offer: string;
  /** What is already happening, once the lamps have flashed. */
  readonly accepted: string;
  /** Calm while they wait; the alley face once you have asked. */
  readonly portrait: { readonly calm: string; readonly keen: string };
}

/** Served beside the cars, and resolved against the document base the same way. */
const portraits = (id: string) => ({
  calm: `assets/characters/${id}.png`,
  keen: `assets/characters/${id}-alley.png`,
});

export const RIVAL_CARDS: readonly RivalCard[] = [
  {
    id: RIVET.id, name: RIVET.name, car: RIVET.carName, turf: "Harbor Quarter",
    offer: "402 m drag", accepted: "402 m drag · lights out", portrait: portraits(RIVET.id),
  },
  {
    id: SABLE.id, name: SABLE.name, car: SABLE.carName, turf: "South Wharf yard",
    offer: "3,000 point drift", accepted: "90 seconds · 3,000 points", portrait: portraits(SABLE.id),
  },
  {
    id: MOTH.id, name: MOTH.name, car: MOTH.carName, turf: "Freight block",
    offer: "Street race", accepted: "Drawing a race…", portrait: portraits(MOTH.id),
  },
];

export function rivalCard(id: string | null | undefined): RivalCard | null {
  return RIVAL_CARDS.find(card => card.id === id) ?? null;
}

/** What the card reads for one rival in one state. */
export interface CardCopy {
  readonly name: string;
  readonly meta: string;
  readonly action: string;
  readonly portrait: string;
}

export function cardCopy(card: RivalCard, accepted: boolean, flashLabel: string): CardCopy {
  return {
    name: card.name,
    meta: `${card.car} · ${card.turf}`,
    // The binding leads the offer, because the offer is an instruction. Once it
    // is accepted the instruction is spent, and repeating it would be a lie.
    action: accepted ? `Accepted · ${card.accepted}` : `${flashLabel} · Flash headlights — ${card.offer}`,
    portrait: accepted ? card.portrait.keen : card.portrait.calm,
  };
}
