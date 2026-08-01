"""Generate ``vowels_rp.json`` from authentic Deterding (1997) measurements.

Source (do NOT invent numbers):
    Deterding, D. (1997). The Formants of Monophthong Vowels in Standard
    Southern British English Pronunciation. Journal of the International
    Phonetic Association, 27, 47-55.

- Means come from Table 2 (average of five male / five female BBC broadcasters,
  connected speech from the MARSEC database).
- Standard deviations are computed here as the *between-speaker* SD across the
  five per-speaker averages in the paper's Appendix (Tables A1 / A2). They are a
  faithful derivation of the published data, not fabricated, and are used to
  draw the acceptable-range ellipse on the F1-F2 chart.

Deterding (1997) measured 11 monophthongs and did NOT include the reduced
central vowel schwa /ə/. We keep /ə/ in the vowel list for completeness but mark
it as having no literature reference (null formants); the frontend degrades
gracefully (no target/ellipse for it).

Run:  python generate_vowels_rp.py   (writes vowels_rp.json next to this file)
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

# Table 2 order. example_word: classic RP keyword; type: teaching label.
VOWELS = [
    # id,   ipa,  example, type
    ("iː", "iː", "sheep", "长元音 / 前高"),
    ("ɪ", "ɪ", "ship", "短元音 / 前次高"),
    ("e", "e", "bed", "短元音 / 前中"),
    ("æ", "æ", "cat", "短元音 / 前低"),
    ("ʌ", "ʌ", "cup", "短元音 / 央"),
    ("ɑː", "ɑː", "car", "长元音 / 后低"),
    ("ɒ", "ɒ", "hot", "短元音 / 后低"),
    ("ɔː", "ɔː", "door", "长元音 / 后中"),
    ("ʊ", "ʊ", "book", "短元音 / 后次高"),
    ("uː", "uː", "food", "长元音 / 后高"),
    ("ɜː", "ɜː", "bird", "长元音 / 央"),
]

# Table 2 means (F1, F2, F3) in Hz.
MEANS = {
    "male": {
        "iː": (280, 2249, 2765), "ɪ": (367, 1757, 2556), "e": (494, 1650, 2547),
        "æ": (690, 1550, 2463), "ʌ": (644, 1259, 2551), "ɑː": (646, 1155, 2490),
        "ɒ": (558, 1047, 2481), "ɔː": (415, 828, 2619), "ʊ": (379, 1173, 2445),
        "uː": (316, 1191, 2408), "ɜː": (478, 1436, 2488),
    },
    "female": {
        "iː": (303, 2654, 3203), "ɪ": (384, 2174, 2962), "e": (719, 2063, 2997),
        "æ": (1018, 1799, 2869), "ʌ": (914, 1459, 2831), "ɑː": (910, 1316, 2841),
        "ɒ": (751, 1215, 2790), "ɔː": (389, 888, 2796), "ʊ": (410, 1340, 2697),
        "uː": (328, 1437, 2674), "ɜː": (606, 1695, 2839),
    },
}

# Appendix A1 (male B,C,H,J,K) and A2 (female A,D,E,F,G): per-speaker (F1, F2).
PER_SPEAKER_F1F2 = {
    "male": {
        "iː": [(281, 2016), (276, 2218), (280, 2600), (302, 2008), (261, 2402)],
        "ɪ": [(335, 1430), (396, 1659), (367, 1987), (395, 1670), (344, 2041)],
        "e": [(490, 1397), (509, 1520), (444, 1923), (512, 1587), (515, 1823)],
        "æ": [(661, 1328), (546, 1542), (579, 1769), (790, 1558), (872, 1555)],
        "ʌ": [(635, 1237), (537, 1219), (687, 1382), (704, 1204), (659, 1251)],
        "ɑː": [(694, 1202), (540, 1108), (625, 1165), (649, 1117), (720, 1185)],
        "ɒ": [(611, 1113), (482, 1042), (609, 1125), (558, 1000), (530, 956)],
        "ɔː": [(419, 906), (397, 709), (448, 925), (425, 835), (388, 764)],
        "ʊ": [(370, 1195), (378, 1323), (391, 1136), (387, 1268), (368, 945)],
        "uː": [(321, 1247), (298, 1373), (327, 1123), (343, 1343), (291, 870)],
        "ɜː": [(472, 1265), (507, 1397), (523, 1468), (462, 1398), (425, 1651)],
    },
    "female": {
        "iː": [(304, 2664), (284, 2694), (300, 2582), (321, 2606), (306, 2725)],
        "ɪ": [(365, 2157), (387, 2215), (410, 2070), (392, 2147), (364, 2279)],
        "e": [(853, 2054), (620, 2157), (634, 1926), (738, 2065), (750, 2114)],
        "æ": [(1067, 1690), (971, 1892), (1045, 1766), (972, 1884), (1033, 1761)],
        "ʌ": [(1044, 1495), (950, 1512), (843, 1464), (875, 1489), (860, 1335)],
        "ɑː": [(1010, 1304), (903, 1305), (903, 1393), (895, 1327), (837, 1250)],
        "ɒ": [(761, 1243), (765, 1216), (680, 1249), (823, 1243), (727, 1123)],
        "ɔː": [(398, 934), (373, 849), (334, 959), (427, 876), (412, 823)],
        "ʊ": [(391, 1798), (421, 1361), (415, 1234), (406, 1199), (418, 1109)],
        "uː": [(333, 1529), (319, 1521), (328, 1396), (343, 1437), (316, 1302)],
        "ɜː": [(443, 1762), (746, 1627), (517, 1676), (695, 1705), (631, 1704)],
    },
}


def build() -> dict:
    genders = {}
    for gender in ("male", "female"):
        vowels = []
        for vid, ipa, word, vtype in VOWELS:
            f1, f2, f3 = MEANS[gender][vid]
            f1_list = [p[0] for p in PER_SPEAKER_F1F2[gender][vid]]
            f2_list = [p[1] for p in PER_SPEAKER_F1F2[gender][vid]]
            vowels.append({
                "id": vid,
                "ipa": ipa,
                "example_word": word,
                "type": vtype,
                "f1_mean": f1,
                "f2_mean": f2,
                "f3_mean": f3,
                # between-speaker SD across the 5 speaker averages (sample SD)
                "f1_sd": round(statistics.stdev(f1_list), 1),
                "f2_sd": round(statistics.stdev(f2_list), 1),
                "has_reference": True,
                "demo_audio": None,
            })
        # schwa: no reference value in Deterding (1997)
        vowels.append({
            "id": "ə",
            "ipa": "ə",
            "example_word": "about",
            "type": "弱读央元音",
            "f1_mean": None,
            "f2_mean": None,
            "f3_mean": None,
            "f1_sd": None,
            "f2_sd": None,
            "has_reference": False,
            "reference_note": "Deterding (1997) 未测量弱读央元音 /ə/；此处无文献靶心。",
            "demo_audio": None,
        })
        genders[gender] = vowels

    return {
        "meta": {
            "accent": "British English (RP) / Standard Southern British",
            "notation": "DJ / Gimson (with length mark ː)",
            "source": (
                "Deterding, D. (1997). The Formants of Monophthong Vowels in "
                "Standard Southern British English Pronunciation. Journal of the "
                "International Phonetic Association, 27, 47-55."
            ),
            "source_details": (
                "Means: Table 2 (5 male / 5 female BBC broadcasters, connected "
                "speech, MARSEC). SDs: between-speaker SD computed from Appendix "
                "A1/A2 per-speaker averages."
            ),
            "gender_basis": "stored per-gender (male, female); default is configurable",
            "unit": "Hz",
            "vowel_count": 11,
            "notes": "schwa /ə/ has no reference value in Deterding (1997).",
        },
        "genders": genders,
    }


if __name__ == "__main__":
    out = Path(__file__).with_name("vowels_rp.json")
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out}")
