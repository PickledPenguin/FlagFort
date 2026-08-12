const campaignImage = (name: string): string => `./images/campaign/${name}.svg`;

export const CAMPAIGN_TIER_ARTWORK = {
  forest: {
    icon: campaignImage("forest-tier"),
    backdrop: campaignImage("forest-backdrop"),
  },
  snowy: {
    icon: campaignImage("snowy-tier"),
    backdrop: campaignImage("snowy-backdrop"),
  },
  desert: {
    icon: campaignImage("desert-tier"),
    backdrop: campaignImage("desert-backdrop"),
  },
} as const satisfies Record<string, { icon: string; backdrop: string }>;
