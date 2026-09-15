import { BLACKLIST, SABLE_DRIFT_TARGETS, stagePayout, type BlacklistName } from "../settings/blacklist.ts";
import { currentName, type CareerProgress } from "../settings/progress.ts";

/**
 * The Blacklist screen: all ten names, #1 at the top, where each stands and what
 * beating them pays. Rows are data (`blacklistRows`), so the rules are testable
 * without a DOM; the panel only draws them.
 */
export type BlacklistStanding = "beaten" | "current" | "ahead";
export interface BlacklistRow {
  id: string;
  rank: number;
  name: string;
  carName: string;
  standing: BlacklistStanding;
  wins: number;
  /** Where they stand, in a line. */
  status: string;
  /** Everything the three stages pay, and the car. */
  reward: string;
}

const money = (dollars: number) => `$${dollars.toLocaleString("en-US")}`;
const KIND: Record<string, string> = { sprint: "sprint", circuit: "circuit", unordered: "unordered checkpoints", drag: "402 m drag", drift: "drift" };

/** What a stage is, in a few words: "Rematch · circuit", "Second win · drift, 3,600 pts". */
export function stageLine(name: BlacklistName, index: number): string {
  const stage = name.stages[index]!;
  const target = stage.kind === "drift" ? `, ${SABLE_DRIFT_TARGETS[index]!.toLocaleString("en-US")} pts` : "";
  return `${stage.name} · ${KIND[stage.kind]}${target}`;
}

export function blacklistRows(career: Pick<CareerProgress, "names">): BlacklistRow[] {
  const current = currentName(career);
  return [...BLACKLIST].reverse().map(name => {
    const wins = career.names[name.id]?.wins ?? 0;
    const standing: BlacklistStanding = wins === 3 ? "beaten" : name.id === current?.id ? "current" : "ahead";
    const below = BLACKLIST[BLACKLIST.indexOf(name) - 1];
    const status = standing === "beaten" ? `Beaten · ${name.carName} in your garage`
      : standing === "current" ? `${wins}/3 wins · Next: ${stageLine(name, wins)} · ${money(stagePayout(name.rank, wins))}`
      : `Races for nothing until #${below!.rank} ${below!.name} is beaten`;
    const total = [0, 1, 2].reduce((sum, stage) => sum + stagePayout(name.rank, stage), 0);
    return { id: name.id, rank: name.rank, name: name.name, carName: name.carName, standing, wins, status,
      reward: `${money(total)} + ${name.carName}` };
  });
}

export interface BlacklistPanelOptions {
  career(): CareerProgress;
  /** Whether the career could be read; an unreadable one is said, not shown as a fresh start. */
  unavailable(): boolean;
  /** A name's portrait and turf, from its contact card. */
  card(id: string): { turf: string; portrait: string } | null;
}

export function createBlacklistPanel(options: BlacklistPanelOptions) {
  const root = document.querySelector<HTMLElement>('[data-menu-screen="blacklist"]')!;
  const list = root.querySelector<HTMLElement>("[data-blacklist]")!;
  const status = root.querySelector<HTMLElement>("[data-blacklist-status]")!;
  function render(): void {
    list.replaceChildren();
    status.textContent = options.unavailable() ? "Career progress could not be read. Existing data has been left untouched." : "";
    for (const row of blacklistRows(options.career())) {
      const card = options.card(row.id);
      const item = document.createElement("div");
      item.className = "blacklist-row";
      item.dataset.standing = row.standing;
      item.dataset.blacklistName = row.id;
      const rank = document.createElement("span");
      rank.className = "blacklist-rank";
      rank.textContent = `#${row.rank}`;
      const face = document.createElement("img");
      face.className = "blacklist-face";
      face.alt = "";
      if (card) face.src = new URL(card.portrait, document.baseURI).href;
      const text = document.createElement("div"), title = document.createElement("strong"), meta = document.createElement("span"), line = document.createElement("span");
      title.textContent = row.name;
      meta.textContent = [row.carName, card?.turf].filter(Boolean).join(" · ");
      line.textContent = row.status;
      text.append(title, meta, line);
      const reward = document.createElement("span");
      reward.className = "blacklist-reward";
      reward.textContent = row.standing === "beaten" ? "Retired" : row.reward;
      item.append(rank, face, text, reward);
      list.append(item);
    }
  }
  return { render };
}
