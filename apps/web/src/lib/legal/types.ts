export type LegalSlug = "privacy" | "terms" | "cookies" | "refunds";

export type LegalLocale = "en" | "ar";

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  /** ISO date of the last substantive change; must equal LEGAL_VERSION. */
  updated: string;
  intro: string[];
  sections: LegalSection[];
};

export type LegalContent = Record<LegalLocale, LegalDocument>;

export type LegalJurisdiction = "mainland" | "difc" | "adgm";

export type BusinessDetails = {
  entityName: string;
  address: string;
  email: string;
  license: string | null;
  jurisdiction: LegalJurisdiction;
  /** True only when every required value is set. */
  isConfigured: boolean;
};
