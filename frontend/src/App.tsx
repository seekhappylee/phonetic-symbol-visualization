import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  fetchHealth,
  fetchOverlays,
  fetchVowels,
  listReferenceSets,
} from "./api/client";
import type {
  Gender,
  HealthResponse,
  ReferenceOverlay,
  ReferenceSet,
  VowelsResponse,
} from "./types";
import TheoryPage from "./pages/TheoryPage";
import VowelChartPage from "./pages/VowelChartPage";
import PracticePage from "./pages/PracticePage";
import StandardLibraryPage from "./pages/StandardLibraryPage";

type Page = "theory" | "charts" | "practice" | "library";

const TABS: { id: Page; label: string }[] = [
  { id: "theory", label: "① 发音原理" },
  { id: "charts", label: "② 元音图" },
  { id: "practice", label: "③ 录音练习" },
  { id: "library", label: "④ 标准音库" },
];

export default function App() {
  const [page, setPage] = useState<Page>("charts");
  const [gender, setGender] = useState<Gender>("male");
  const [data, setData] = useState<VowelsResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedVowel, setSelectedVowel] = useState<string | null>("iː");
  const [overlays, setOverlays] = useState<ReferenceOverlay[]>([]);
  const [enabledOverlays, setEnabledOverlays] = useState<Set<string>>(new Set());
  const [referenceSets, setReferenceSets] = useState<ReferenceSet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadSets = useCallback(() => {
    listReferenceSets()
      .then((r) => setReferenceSets(r.sets))
      .catch(() => setReferenceSets([]));
  }, []);

  const toggleOverlay = useCallback((id: string) => {
    setEnabledOverlays((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
    reloadSets();
  }, [reloadSets]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchVowels(gender)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [gender]);

  // Overlay datasets are optional; a failure here must not break the app.
  useEffect(() => {
    fetchOverlays(gender)
      .then((r) => setOverlays(r.overlays))
      .catch(() => setOverlays([]));
  }, [gender]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">RP</span>
          <div>
            <h1>英音发音辅助学习系统</h1>
            <p className="subtitle">英式英语 (RP · DJ/Gimson) 元音共振峰可视化训练</p>
          </div>
        </div>
        <div className="header-controls">
          <label className="gender-toggle">
            参考基准：
            <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="male">男声</option>
              <option value="female">女声</option>
            </select>
          </label>
          <HealthBadge health={health} />
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${page === t.id ? "active" : ""}`}
            onClick={() => setPage(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {error && (
          <div className="banner error">
            无法连接后端：{error}
            <br />
            请确认后端已启动（<code>uv run uvicorn app.main:app --reload</code>），
            且 <code>VITE_API_BASE</code> 指向正确地址。
          </div>
        )}

        {loading && !data && <div className="loading">加载参考数据中…</div>}

        {data && page === "theory" && <TheoryPage />}
        {data && page === "charts" && (
          <VowelChartPage
            data={data}
            selectedVowel={selectedVowel}
            onSelectVowel={setSelectedVowel}
            overlays={overlays}
            enabledOverlays={enabledOverlays}
            onToggleOverlay={toggleOverlay}
          />
        )}
        {data && page === "practice" && (
          <PracticePage
            data={data}
            gender={gender}
            ffmpegAvailable={health?.ffmpeg_available ?? true}
            selectedVowel={selectedVowel}
            onSelectVowel={setSelectedVowel}
            overlays={overlays}
            enabledOverlays={enabledOverlays}
            onToggleOverlay={toggleOverlay}
            referenceSets={referenceSets}
          />
        )}
        {data && page === "library" && (
          <StandardLibraryPage
            data={data}
            sets={referenceSets}
            globalGender={gender}
            onSetsChanged={reloadSets}
          />
        )}
      </main>

      <footer className="app-footer">
        参考数据：Deterding (1997), JIPA 27, 47–55 · 声学分析：praat-parselmouth ·
        标注体系：RP DJ/Gimson
      </footer>
    </div>
  );
}

function HealthBadge({ health }: { health: HealthResponse | null }) {
  if (!health) return <span className="badge offline">后端离线</span>;
  return (
    <span
      className={`badge ${health.ffmpeg_available ? "online" : "warn"}`}
      title={health.notes.join("\n") || "后端正常"}
    >
      后端就绪{health.ffmpeg_available ? "" : "（无 ffmpeg）"}
    </span>
  );
}
