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
  volcanic: {
    icon: campaignImage("volcanic-tier"),
    backdrop: campaignImage("volcanic-backdrop"),
  },
  wasteland: {
    icon: campaignImage("wasteland-tier"),
    backdrop: campaignImage("wasteland-backdrop"),
  },
  rift: {
    icon: campaignImage("rift-tier"),
    backdrop: campaignImage("rift-backdrop"),
  },
  mire: {
    icon: campaignImage("mire-tier"),
    backdrop: campaignImage("mire-backdrop"),
  },
} as const satisfies Record<string, { icon: string; backdrop: string }>;
