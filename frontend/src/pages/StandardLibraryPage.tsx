import { useEffect, useMemo, useState } from "react";
import FormantChart from "../components/FormantChart";
import VowelClipEditor from "../components/VowelClipEditor";
import {
  createReferenceSet,
  deleteReferenceSet,
  patchReferenceSet,
} from "../api/client";
import { buildChartVowels } from "../data/referenceSet";
import type { Gender, ReferenceSet, VowelsResponse } from "../types";

interface Props {
  data: VowelsResponse; // vowel metadata (ipa / example) for labels
  sets: ReferenceSet[];
  globalGender: Gender;
  onSetsChanged: (next?: ReferenceSet) => void; // reload app-level list
}

/**
 * Build & manage user "standard" F1/F2 sets from their own recordings: create a
 * named set (male/female), fill each vowel by recording/uploading a clip, slice
 * it, and pick the steady window. Saved sets become selectable elsewhere as the
 * comparison target, with playable demo audio.
 */
export default function StandardLibraryPage({
  data,
  sets,
  globalGender,
  onSetsChanged,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<ReferenceSet | null>(null);
  const [activeVowel, setActiveVowel] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<Gender>(globalGender);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the open set in sync with the app-level list.
  useEffect(() => {
    if (selectedId) {
      setCurrent(sets.find((s) => s.id === selectedId) ?? null);
    }
  }, [sets, selectedId]);

  const open = (s: ReferenceSet) => {
    setSelectedId(s.id);
    setCurrent(s);
    setActiveVowel(null);
    setError(null);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await createReferenceSet(newName.trim() || "未命名标准音库", newGender);
      setNewName("");
      onSetsChanged(s);
      open(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: ReferenceSet) => {
    if (!confirm(`删除标准音库「${s.name}」及其所有音频？此操作不可撤销。`)) return;
    setBusy(true);
    try {
      await deleteReferenceSet(s.id);
      if (selectedId === s.id) {
        setSelectedId(null);
        setCurrent(null);
      }
      onSetsChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (name: string) => {
    if (!current) return;
    try {
      const s = await patchReferenceSet(current.id, { name });
      setCurrent(s);
      onSetsChanged(s);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onChildUpdate = (s: ReferenceSet) => {
    setCurrent(s);
    onSetsChanged(s);
  };

  const chartVowels = useMemo(
    () => buildChartVowels(data.vowels, current),
    [data.vowels, current]
  );
  const filledCount = current?.vowels.filter((v) => v.f1_mean != null).length ?? 0;
  const activeMeta = data.vowels.find((v) => v.id === activeVowel) ?? null;
  const activeExisting = current?.vowels.find((v) => v.id === activeVowel);

  return (
    <div className="page standard-lib-page">
      <h2>标准音库：用你自己的录音建立对比标准</h2>
      <p className="lead">
        录制或上传每个元音的发音，切片并选好稳态段后保存。整套完成后可命名、选男女；
        之后在「③ 录音练习」里可选择用哪一套标准（文献或你上传的）做对比，并回放示范音。
      </p>

      {error && <div className="banner error">{error}</div>}

      <div className="lib-layout">
        <aside className="lib-sidebar">
          <h3>我的标准音库</h3>
          {sets.length === 0 && <p className="muted">还没有。新建一套开始吧。</p>}
          <ul className="set-list">
            {sets.map((s) => (
              <li
                key={s.id}
                className={`set-item ${selectedId === s.id ? "active" : ""}`}
                onClick={() => open(s)}
              >
                <div className="set-item-main">
                  <span className="set-name">{s.name}</span>
                  <span className="set-meta">
                    {s.gender === "female" ? "女声" : "男声"} ·{" "}
                    {s.vowels.filter((v) => v.f1_mean != null).length}/{data.vowels.length} 元音
                  </span>
                </div>
                <button
                  className="btn ghost tiny danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(s);
                  }}
                  disabled={busy}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>

          <div className="new-set">
            <h4>新建一套</h4>
            <input
              type="text"
              placeholder="名称，如 我的RP-2026"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <label>
              性别基准：
              <select
                value={newGender}
                onChange={(e) => setNewGender(e.target.value as Gender)}
              >
                <option value="male">男声</option>
                <option value="female">女声</option>
              </select>
            </label>
            <button className="btn primary" onClick={create} disabled={busy}>
              ＋ 新建
            </button>
          </div>
        </aside>

        <section className="lib-main">
          {!current ? (
            <p className="muted">从左侧选择或新建一套标准音库。</p>
          ) : (
            <>
              <div className="lib-set-head">
                <input
                  className="set-title-input"
                  value={current.name}
                  onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                  onBlur={(e) => rename(e.target.value)}
                />
                <span className="set-meta">
                  {current.gender === "female" ? "女声" : "男声"} · 已录入 {filledCount}/
                  {data.vowels.length}
                </span>
              </div>

              <div className="lib-grid">
                <div className="vowel-slots">
                  {data.vowels.map((v) => {
                    const sv = current.vowels.find((x) => x.id === v.id);
                    const done = sv?.f1_mean != null;
                    return (
                      <button
                        key={v.id}
                        className={`vowel-slot ${activeVowel === v.id ? "active" : ""} ${
                          done ? "done" : sv ? "partial" : ""
                        }`}
                        onClick={() => setActiveVowel(v.id)}
                      >
                        <span className="slot-ipa">{v.ipa}</span>
                        <span className="slot-word">{v.example_word}</span>
                        <span className="slot-status">
                          {done
                            ? `${Math.round(sv!.f1_mean as number)}/${Math.round(
                                sv!.f2_mean as number
                              )}`
                            : sv
                            ? "音频待复核"
                            : "未录"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="lib-chart">
                  <figcaption>本套 F1–F2 图（反向坐标）</figcaption>
                  <FormantChart
                    vowels={chartVowels}
                    targetVowelId={activeVowel}
                    onPickVowel={setActiveVowel}
                  />
                </div>
              </div>

              {activeMeta ? (
                <VowelClipEditor
                  key={`${current.id}:${activeMeta.id}`}
                  setId={current.id}
                  gender={current.gender}
                  vowelId={activeMeta.id}
                  ipa={activeMeta.ipa}
                  exampleWord={activeMeta.example_word}
                  existing={activeExisting}
                  onSaved={onChildUpdate}
                  onDeleted={onChildUpdate}
                />
              ) : (
                <p className="muted">点上方任一元音，开始录音 / 上传该元音的发音。</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
