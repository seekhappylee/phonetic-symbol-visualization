import { useEffect, useRef, useState } from "react";

interface Props {
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
}

type State = "idle" | "requesting" | "recording" | "recorded" | "error";

/**
 * Browser-side recorder (Web Audio API + MediaRecorder). Per the hard constraint
 * (dev doc §2.1), audio is captured in the browser; the backend never touches
 * the microphone. The user can naturally record multiple passes in one take.
 */
export default function Recorder({ onRecorded, disabled }: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() {
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
  }
  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function start() {
    setError(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        onRecorded(blob);
        setState("recorded");
      };
      rec.start();
      recorderRef.current = rec;
      setState("recording");
      startTimer();
    } catch (e) {
      setState("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "麦克风权限被拒绝。请在浏览器地址栏允许麦克风访问后重试。"
          : "无法访问麦克风：" + (e as Error).message
      );
    }
  }

  function stop() {
    stopTimer();
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  return (
    <div className="recorder">
      <div className="recorder-controls">
        {state === "recording" ? (
          <button className="btn danger" onClick={stop}>
            ■ 停止（{elapsed.toFixed(1)}s）
          </button>
        ) : (
          <button
            className="btn primary"
            onClick={start}
            disabled={disabled || state === "requesting"}
          >
            ● {state === "recorded" ? "重新录音" : "开始录音"}
          </button>
        )}
        {state === "recording" && <span className="rec-dot" aria-hidden />}
      </div>

      <p className="recorder-tip">
        可连续发同一个元音若干遍（每遍之间稍作停顿），系统会自动分遍。
      </p>

      {audioUrl && (
        <audio controls src={audioUrl} className="playback">
          您的浏览器不支持音频回放。
        </audio>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function pickMime(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}
