import type { WorkSettings } from "./engine";
export type WorkRole = "engineering" | "gtm" | "account_support";
export const ROLE_NAMES: Record<WorkRole, string> = {
  engineering: "Engineering",
  gtm: "GTM",
  account_support: "Technical accounts",
};
export const ACTION_NAMES: Record<string, string> = {
  reuse: "Reuse the previous result",
  refresh: "Refresh the source",
  retest: "Rerun the focused check",
  escalate: "Ask for clarification",
};
export function workCase(s: WorkSettings, role: WorkRole, issue: string) {
  const fields =
    role === "engineering"
      ? ["renderer_version", "asset_manifest", "device_profile"]
      : role === "gtm"
        ? ["customer_segment", "offer_version", "buying_stage"]
        : ["product_version", "deployment_mode", "feature_setting"];
  const current = [s.codeRevision, s.offerRevision, s.customerRevision];
  return {
    role,
    goal:
      role === "engineering"
        ? "Decide which checks are needed before accepting this change."
        : role === "gtm"
          ? "Decide whether the existing prospect recommendation is still usable."
          : "Decide whether a previous technical answer applies to this customer.",
    prior_conclusion:
      role === "engineering"
        ? "The targeted regression checks passed."
        : role === "gtm"
          ? "This segment fits the proposed offer."
          : "The documented configuration resolves this symptom.",
    depends_on: fields,
    prior_conditions: Object.fromEntries(fields.map((k) => [k, `${k}-1`])),
    current_conditions: Object.fromEntries(
      fields.map((k, i) => [k, `${k}-${current[i]}`]),
    ),
    sources: [
      {
        name:
          role === "engineering"
            ? "test_manifest"
            : role === "gtm"
              ? "pricing_sheet"
              : "support_matrix",
        age_days: issue === "stale" ? 14 : 1,
        valid_for_days: 7,
      },
    ],
    missing_required_facts: issue === "missing" ? [fields[2]] : [],
    unresolved_authoritative_conflict: issue === "conflict",
    note: "A prior result applies only to the inputs it checked.",
  };
}
