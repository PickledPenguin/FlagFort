import {
  Dumbbell,
  Flag,
  Gauge,
  Hammer,
  HeartOff,
  Orbit,
  ShieldHalf,
  Skull,
  Sprout,
  Timer,
  Users,
  Wrench,
} from "lucide";
import type { ChallengeIcon } from "./challenges";

type LucideAttributes = Readonly<Record<string, string | number>>;
type LucideNode = readonly [
  tag: string,
  attributes: LucideAttributes,
  children?: readonly LucideNode[],
];

const CHALLENGE_ICONS: Record<ChallengeIcon, LucideNode> = {
  timer: Timer,
  sprout: Sprout,
  hammer: Hammer,
  "wrench-off": Wrench,
  "shield-half": ShieldHalf,
  flag: Flag,
  "heart-off": HeartOff,
  orbit: Orbit,
  users: Users,
  skull: Skull,
  gauge: Gauge,
  dumbbell: Dumbbell,
};

function escapeAttribute(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderNode([tag, attributes, children = []]: LucideNode): string {
  const renderedAttributes = Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");
  return `<${tag}${renderedAttributes ? ` ${renderedAttributes}` : ""}>${children.map(renderNode).join("")}</${tag}>`;
}

export function challengeIcon(name: ChallengeIcon): string {
  const [tag, attributes, children] = CHALLENGE_ICONS[name];
  return renderNode([
    tag,
    {
      ...attributes,
      class: "challenge-icon",
      "aria-hidden": "true",
      focusable: "false",
    },
    children,
  ]);
}
