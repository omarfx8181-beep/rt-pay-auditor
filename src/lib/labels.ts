/**
 * Plain-language labels for every pay line (V3 brief §4 copy voice).
 * The engine keeps the stub's technical labels (they ARE the receipt);
 * default views speak human. Codes surface only in expanded detail
 * rows and in the HR email, where payroll needs them.
 */
export const PLAIN_LABELS: Record<string, string> = {
  reg: "Base pay",
  ot: "Overtime",
  dt: "Double time",
  weekend: "Weekend pay",
  evening: "Evening pay",
  charge: "Charge pay",
  premium: "Premium pay",
  preceptor: "Preceptor pay",
  bonus548: "Critical shift bonus",
  sto: "Sick time (STO)",
  loa: "Leave of absence",
  medical: "Medical leave",
  imputed: "Life insurance (non-cash)",
  gross: "Total before taxes",
  fed: "Federal tax",
  mn: "Minnesota tax",
  ss: "Social Security",
  medicare: "Medicare",
  mnFam: "MN paid family leave",
  mnMed: "MN paid medical leave",
  pretax: "Retirement + insurance (pretax)",
  aftertax: "After-tax deductions",
  net: "Take-home",
};

export const plainLabel = (key: string, fallback: string): string => PLAIN_LABELS[key] ?? fallback;
