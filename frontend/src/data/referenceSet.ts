import type { ReferenceSet, VowelReference } from "../types";

/**
 * Merge a user set's analyzed F1/F2 points onto the vowel metadata (ipa /
 * example / type) so the set can be charted as the bullseyes. Sets carry no SD,
 * so no acceptance ellipse is drawn (point only). Vowels absent from the set are
 * marked has_reference=false and simply not drawn.
 */
export function buildChartVowels(
  meta: VowelReference[],
  set: ReferenceSet | null
): VowelReference[] {
  const byId = new Map((set?.vowels ?? []).map((v) => [v.id, v]));
  return meta.map((m) => {
    const sv = byId.get(m.id);
    return {
      ...m,
      f1_mean: sv?.f1_mean ?? null,
      f2_mean: sv?.f2_mean ?? null,
      f3_mean: sv?.f3_mean ?? null,
      f1_sd: null,
      f2_sd: null,
      has_reference: sv?.f1_mean != null,
      demo_f1: null,
      demo_f2: null,
    };
  });
}
