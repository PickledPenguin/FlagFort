import { ASSETS } from "./assets";
import type { ChallengeIcon } from "./challenges";

export function challengeIcon(name: ChallengeIcon): string {
  return `<img class="challenge-icon" src="${ASSETS.challenges[name]}" alt="" aria-hidden="true">`;
}
