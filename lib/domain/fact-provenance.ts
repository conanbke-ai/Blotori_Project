export type FactAdmissionStatus = "RAW_USER_INPUT" | "USER_CONFIRMED" | "EXTERNAL_VERIFIED" | "UNKNOWN" | "NOT_APPLICABLE";

export interface ProvenanceFact {
  status: FactAdmissionStatus;
  value?: string;
  sourceUrl?: string;
  checkedAt?: string;
}

export interface PlannedFact {
  key: string;
  label: string;
  sourceField: string | null;
  /** Exact form input retained for provenance. Never mutate or silently promote it. */
  rawValue: string;
  status: FactAdmissionStatus;
  value?: string;
  sourceUrl?: string;
  checkedAt?: string;
  unknownHandling: "explicit" | "omit";
}

export interface FactPlan {
  version: 1;
  scope: string;
  facts: PlannedFact[];
}

export function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function validHttpsSourceUrl(value: string): boolean {
  if (!value || value !== value.trim() || /\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function admittedProvenanceValue(fact: ProvenanceFact | undefined, requiresDate = false): string | null {
  const value = fact?.value?.trim();
  if (!fact || !value) return null;
  const dated = Boolean(fact.checkedAt && validCalendarDate(fact.checkedAt));
  if (fact.status === "USER_CONFIRMED") return requiresDate && !dated ? null : value;
  if (fact.status !== "EXTERNAL_VERIFIED") return null;
  return fact.sourceUrl && validHttpsSourceUrl(fact.sourceUrl) && dated ? value : null;
}

/**
 * Project a value into a generation contract without claiming that raw form text
 * has been independently confirmed. This is deliberately broader than admission.
 */
export function projectedProvenanceValue(fact: ProvenanceFact | undefined): string | null {
  const value = fact?.value?.trim();
  if (!fact || !value) return null;
  return fact.status === "RAW_USER_INPUT" ? value : admittedProvenanceValue(fact, false);
}
