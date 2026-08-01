// Articulatory positions of the 12 RP monophthongs on the IPA quadrilateral.
// frontness: 0 = front, 1 = back ; height: 0 = close/high, 1 = open/low.
// These drive only the IPA quadrilateral (the articulatory "action guide").
// The acoustic F1-F2 chart is driven entirely by measured/reference formants.

export interface QuadPosition {
  id: string;
  ipa: string;
  frontness: number;
  height: number;
  rounded?: boolean; // lip rounding (back rounded vowels)
}

export const QUAD_POSITIONS: QuadPosition[] = [
  { id: "iː", ipa: "iː", frontness: 0.02, height: 0.04 },
  { id: "ɪ", ipa: "ɪ", frontness: 0.22, height: 0.2 },
  { id: "e", ipa: "e", frontness: 0.16, height: 0.46 },
  { id: "æ", ipa: "æ", frontness: 0.24, height: 0.86 },
  { id: "ʌ", ipa: "ʌ", frontness: 0.62, height: 0.74 },
  { id: "ɑː", ipa: "ɑː", frontness: 0.92, height: 0.96 },
  { id: "ɒ", ipa: "ɒ", frontness: 0.95, height: 0.86, rounded: true },
  { id: "ɔː", ipa: "ɔː", frontness: 0.96, height: 0.54, rounded: true },
  { id: "ʊ", ipa: "ʊ", frontness: 0.74, height: 0.24, rounded: true },
  { id: "uː", ipa: "uː", frontness: 0.9, height: 0.1, rounded: true },
  { id: "ɜː", ipa: "ɜː", frontness: 0.5, height: 0.46 },
  { id: "ə", ipa: "ə", frontness: 0.55, height: 0.5 },
];

// A distinct, stable color per vowel, shared by both charts and the panel so the
// eye can link a point across figures.
export const VOWEL_COLORS: Record<string, string> = {
  "iː": "#e6194b",
  "ɪ": "#f58231",
  e: "#ffa600",
  æ: "#bcbd22",
  ʌ: "#3cb44b",
  "ɑː": "#008080",
  "ɒ": "#46c2e0",
  "ɔː": "#4363d8",
  "ʊ": "#911eb4",
  "uː": "#e055c8",
  "ɜː": "#9a6324",
  ə: "#808080",
};

export function vowelColor(id: string): string {
  return VOWEL_COLORS[id] ?? "#555";
}
