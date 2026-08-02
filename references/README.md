# 英音单元音共振峰参考文献库 / RP vowel formant references

本文件夹收集**多组**英式英语（RP / 南部标准英音）单元音 F1–F2 共振峰的文献测量数据，
用于和你自录的 BBC 发音做**多数据集对照**。应用当前只用了 **Deterding (1997)** 一组靶心，
所以你有时对不上区间——这很正常，原因见下面 §3。

> 数值原则：**只誊抄文献原表，不凭记忆编造**（与开发文档一致）。
> 无法合法获取全文 PDF 的文献，只放引文 + 链接 + 已发表的定性结论，不放数字。

---

## 1. 文件夹结构

```
references/
├── README.md                     ← 本文件（对照总表 + 结论）
├── pdf/
│   ├── Deterding_1997_SSBE_formants.pdf              开放获取全文
│   └── Ferragne_Pellegrino_2010_British_Isles_formants.pdf   开放获取全文
└── data/
    ├── deterding1997_per_speaker_xls/   Deterding 逐讲话者原始测量（A–K，10 人，含每个元音多个 token）
    └── ferragne_pellegrino_2010_sse_male.json   从 Ferragne Table 3 抽取的 sse(伦敦) 男声，应用格式
```

`deterding1997_per_speaker_xls/` 是 Deterding 亲自公开的逐人 Excel 原始数据
（比应用里用的「5 人平均」更细，每个元音有约 10 个 token），可用来自算更真实的散布椭圆。

---

## 2. 文献清单

| # | 文献 | 口音 / 说话者 | 年代（录音） | 方法 | 性别 | 本库内 |
|---|------|--------------|-------------|------|------|--------|
| 1 | **Deterding (1997)** JIPA 27:47–55 | SSBE / RP，5+5 名 **BBC** 播音员（MARSEC 连续语流） | 1980s | LPC + 谱图，均值 | 男&女 | ✅ PDF + 原始数据（**应用现用**） |
| 2 | **Ferragne & Pellegrino (2010)** JIPA 40:1–34 | 英伦 13 口音，其中 `sse`=Standard Southern English(伦敦) 6 男 | 2000s | 半自动，**中位数** | 仅男 | ✅ PDF + JSON |
| 3 | **Hawkins & Midgley (2005)** JIPA 35:183–199 | RP，20 名男声分 **4 个年龄组**（/hVd/） | 2001 | 手工，均值 | 仅男 | 📄 仅引文（付费墙，见 §4） |
| 4 | **Bjelaković (2017)** English Lang. & Ling. 21:501–532 | **当代 RP，BBC 新闻主播** | 2010s | 半自动，均值 | 男&女 | 📄 仅引文（付费墙，见 §4）— **和你的录音来源最接近** |

链接见文末 §6。

---

## 3. 为什么你的 BBC 录音常对不上 Deterding 的区间？

Deterding (1997) 测的是 **1980 年代 MARSEC** 里的 BBC 播音员——发音偏「传统 RP」。
你现在录的 BBC 英语课程是**当代英音**，几十年里 RP 已经漂移。对照 Ferragne(2010, 伦敦)
和已发表的年龄组研究，最主要的系统性变化（也就是你最容易「对不上」的元音）：

- **GOOSE /uː/、FOOT /ʊ/ 前移**：F2 明显升高。
  Deterding 男声 /uː/ F2≈1191、/ʊ/ F2≈1173；Ferragne 伦敦男声中位数 /uː/≈1672、/ʊ/≈1550。
  → 你发的 /uː//ʊ/ 打在图上会**比 Deterding 靶心靠右很多**，其实是对的（现代发音）。
- **TRAP /æ/ 下降**：F1 升高（开口更大）。Hawkins & Midgley (2005) 明确报告年轻组 /æ/ 的 F1 更高。
- **DRESS /e/ 略降**：F1 升高。
- **KIT /ɪ/ 略前/央化**：F2 变动。

所以：**对不上不一定是你发错**，很可能是参考数据比你老。用第 4/2 组当代/伦敦数据对照更公平。

---

## 4. 数据对照表（男声，Hz）

Deterding = 5 名 BBC 男声**均值**（应用现用靶心）；Ferragne sse = 伦敦 6 男**中位数**。
方法不同（均值 vs 中位数、连续语流 vs 朗读关键词），**只比形状/相对位置，别死抠绝对值**。

| 元音 | 关键词 | Deterding F1 | Deterding F2 | Ferragne(伦敦) F1 | Ferragne(伦敦) F2 | 备注 |
|------|--------|:---:|:---:|:---:|:---:|------|
| iː | sheep/heed | 280 | 2249 | 273 | 2289 | 一致 |
| ɪ  | ship/hid   | 367 | 1757 | 386 | 2038 | Ferragne F2 更高（更前） |
| e  | bed/head   | 494 | 1650 | 527 | 1801 | |
| æ  | cat/had    | 690 | 1550 | 751 | 1558 | Ferragne F1 更高（TRAP 更开） |
| ʌ  | cup/Hudd   | 644 | 1259 | 623 | 1370 | |
| ɑː | car/hard   | 646 | 1155 | 655 | 1044 | |
| ɒ  | hot/hod    | 558 | 1047 | 552 | 986  | |
| ɔː | door/hoard | 415 | 828  | 452 | 793  | |
| ʊ  | book/hood  | 379 | 1173 | 397 | **1550** | **FOOT 前移**，差异最大 |
| uː | food/who'd | 316 | 1191 | 291 | **1672** | **GOOSE 前移**，差异最大 |
| ɜː | bird/heard | 478 | 1436 | 527 | 1528 | |

### Deterding 女声均值（应用另一套靶心，供女声录音对照）

| 元音 | F1 | F2 | | 元音 | F1 | F2 |
|------|----|----|---|------|----|----|
| iː | 303 | 2654 | | ɒ  | 751 | 1215 |
| ɪ  | 384 | 2174 | | ɔː | 389 | 888  |
| e  | 719 | 2063 | | ʊ  | 410 | 1340 |
| æ  | 1018| 1799 | | uː | 328 | 1437 |
| ʌ  | 914 | 1459 | | ɜː | 606 | 1695 |
| ɑː | 910 | 1316 | | | | |

Ferragne 只测男声，故女声暂只有 Deterding 一组。若要当代女声靶心，需 Bjelaković (2017)（付费墙）。

---

## 5. 付费墙文献的**定性**结论（无法放数字，仅供判断方向）

- **Hawkins & Midgley (2005)**：RP 男声按年龄分 4 组。年轻组相对老年组——
  /ɛ/ 尤其 **/æ/ 的 F1 更高**（更开/更低），/uː/、/ʊ/ 的 **F2 更高**（前移）。
  → 直接印证 §3 的漂移方向。
- **Bjelaković (2017)**：**当代 RP、BBC 新闻主播**的男女共振峰实测。
  和你的录音来源（BBC 课程）年代/风格最接近，是理想的当代靶心来源。
  如需数字，请通过有机构订阅的渠道获取全文后，按 §7 补入。

---

## 6. 来源链接

- Deterding (1997) 全文：https://fass.ubd.edu.bn/staff/docs/DD/JIPA-SSB-vowels.pdf
- Deterding 逐人原始数据页：https://videoweb.nie.edu.sg/phonetic/data/jipa-vowels/index.htm
- Ferragne & Pellegrino (2010) 全文：http://www.ddl.cnrs.fr/fulltext/Ferragne/Ferragne_2010.pdf
- Hawkins & Midgley (2005)（付费）：https://www.cambridge.org/core/journals/journal-of-the-international-phonetic-association/article/abs/formant-frequencies-of-rp-monophthongs-in-four-age-groups-of-speakers/C188B196938CE9F4F4284879DDFF149E
- Bjelaković (2017)（付费）：https://www.cambridge.org/core/journals/english-language-and-linguistics/article/abs/vowels-of-contemporary-rp-vowel-formant-measurements-for-bbc-newsreaders1/3109BF90B3630215DAABD95111C3DD9C

## 7. 已接入应用：多套靶心叠加对照 ✅

已实现：F1–F2 图上方有「对照数据集」开关，可把 Ferragne(2010, 伦敦) 这套作为叠加层，
和主靶心（Deterding）同框对照；从主靶心到叠加点画虚线，直观显示漂移方向。
叠加层**只作可视化对照，不参与评分**。

- 后端数据（应用格式）：`backend/app/data/overlays/ferragne_2010_sse.json`
  （数值同本目录 `data/ferragne_pellegrino_2010_sse_male.json`，即本 README §4 的伦敦男声中位数）。
- 后端接口：`GET /api/reference-overlays?gender=male|female`（女声暂无数据，开关自动置灰）。
- 再加一套：在 `backend/app/data/overlays/` 放一个同格式 JSON 即可自动出现在开关里。
  例如日后拿到 **Bjelaković (2017)** 当代 BBC 数字，按同格式补一个文件即可上线当代靶心。
