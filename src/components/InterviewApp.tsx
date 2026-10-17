"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import EvaluationReport from "@/components/EvaluationReport";
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_MESSAGE_LENGTH,
  stripEndMarker,
  type ChatMessage,
  type Evaluation,
} from "@/lib/interviewer";

type Phase = "setup" | "interview" | "report";

const primaryButton =
  "rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";
const outlineButton =
  "rounded-full border border-zinc-300 px-4 py-1.5 text-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

async function readError(res: Response) {
  const data = await res.json().catch(() => null);
  return (data?.error as string | undefined) ?? "發生錯誤，請稍後再試";
}

export default function InterviewApp() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobDescription, setJobDescription] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function newController() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }

  async function runEvaluation(history: ChatMessage[]) {
    setPhase("report");
    setEvalError(null);
    setIsEvaluating(true);
    const controller = newController();

    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, messages: history }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await readError(res));
      setEvaluation(await res.json());
    } catch (err) {
      if (controller.signal.aborted) return;
      setEvalError(err instanceof Error ? err.message : "評分失敗，請稍後再試");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsEvaluating(false);
      }
    }
  }

  async function requestInterviewer(history: ChatMessage[]) {
    setError(null);
    setIsLoading(true);
    const controller = newController();
    let finished: ChatMessage[] | null = null;

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, messages: history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(await readError(res));

      setMessages([...history, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: stripEndMarker(raw).text }]);
      }

      const { text, ended: interviewEnded } = stripEndMarker(raw);
      const next: ChatMessage[] = [...history, { role: "assistant", content: text }];
      setMessages(next);
      if (interviewEnded) finished = next;
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "發生錯誤，請稍後再試");
      // 移除空白的面試官訊息
      setMessages(history);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }

    // 面試官宣告面試結束 → 自動產生評分報告
    if (finished) {
      setEnded(true);
      runEvaluation(finished);
    }
  }

  function startInterview(e: FormEvent) {
    e.preventDefault();
    if (!jobDescription.trim()) return;
    setPhase("interview");
    setMessages([]);
    requestInterviewer([]);
  }

  function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || isLoading || ended) return;
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    requestInterviewer(history);
  }

  function endInterviewEarly() {
    if (!window.confirm("確定要結束面試並產生評分報告嗎？")) return;
    setEnded(true);
    runEvaluation(messages);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 避免中文輸入法選字時按 Enter 就送出
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  }

  function resetInterview() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setIsEvaluating(false);
    setMessages([]);
    setInput("");
    setError(null);
    setEnded(false);
    setEvaluation(null);
    setEvalError(null);
    setPhase("setup");
  }

  const hasAnswered = messages.some((m) => m.role === "user");

  if (phase === "setup") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">AI 面試模擬器</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          貼上職缺描述，AI 面試官會依照職缺內容對你進行模擬面試，並根據你的回答追問，結束後提供評分與回饋。
        </p>

        <form onSubmit={startInterview} className="mt-8 flex flex-col gap-4">
          <label htmlFor="jd" className="text-sm font-medium">
            職缺描述
          </label>
          <textarea
            id="jd"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            maxLength={MAX_JOB_DESCRIPTION_LENGTH}
            rows={12}
            placeholder={"例如：\n職稱：前端工程師\n工作內容：使用 React / Next.js 開發產品...\n條件：3 年以上經驗..."}
            className="w-full resize-y rounded-xl border border-zinc-300 bg-white p-4 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {jobDescription.length} / {MAX_JOB_DESCRIPTION_LENGTH}
            </span>
            <button type="submit" disabled={!jobDescription.trim()} className={primaryButton}>
              開始面試
            </button>
          </div>
        </form>
      </main>
    );
  }

  if (phase === "report") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12">
        <header className="flex items-center justify-between border-b border-zinc-200 py-4 dark:border-zinc-800">
          <h1 className="text-lg font-semibold">面試評分報告</h1>
          <div className="flex gap-2">
            <button onClick={() => setPhase("interview")} disabled={isEvaluating} className={outlineButton}>
              查看對話紀錄
            </button>
            <button onClick={resetInterview} className={outlineButton}>
              重新開始
            </button>
          </div>
        </header>

        <div className="py-6">
          {isEvaluating && (
            <div className="flex flex-col items-center gap-3 py-24 text-zinc-500">
              <div className="size-8 animate-spin rounded-full border-4 border-zinc-200 border-t-blue-600" />
              <p className="text-sm">面試官正在整理你的評分與回饋…</p>
            </div>
          )}
          {evalError && !isEvaluating && (
            <div className="flex flex-col items-center gap-3 py-24 text-sm text-red-600">
              <p>{evalError}</p>
              <button onClick={() => runEvaluation(messages)} className={outlineButton}>
                重新產生報告
              </button>
            </div>
          )}
          {evaluation && !isEvaluating && <EvaluationReport evaluation={evaluation} />}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-zinc-200 py-4 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold">AI 面試模擬器</h1>
          <p className="text-xs text-zinc-500">按 Enter 送出，Shift + Enter 換行</p>
        </div>
        <div className="flex gap-2">
          {ended ? (
            <button onClick={() => setPhase("report")} className={outlineButton}>
              查看評分報告
            </button>
          ) : (
            <button
              onClick={endInterviewEarly}
              disabled={isLoading || !hasAnswered}
              className={outlineButton}
            >
              結束面試並評分
            </button>
          )}
          <button onClick={resetInterview} className={outlineButton}>
            重新開始
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                m.role === "user"
                  ? "rounded-br-sm bg-blue-600 text-white"
                  : "rounded-bl-sm bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {m.role === "assistant" && (
                <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">面試官</div>
              )}
              {m.content || <span className="animate-pulse">思考中…</span>}
            </div>
          </div>
        ))}
        {isLoading && messages.at(-1)?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-sm text-zinc-500 dark:bg-zinc-800">
              面試官思考中…
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center gap-3 text-sm text-red-600">
            <span>{error}</span>
            <button onClick={() => requestInterviewer(messages)} className="underline">
              重試
            </button>
          </div>
        )}
        {ended && (
          <div className="py-2 text-center text-sm text-zinc-500">— 面試已結束 —</div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="flex items-end gap-2 border-t border-zinc-200 py-4 dark:border-zinc-800"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          disabled={ended}
          placeholder={ended ? "面試已結束" : "輸入你的回答…"}
          className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" disabled={isLoading || ended || !input.trim()} className={primaryButton}>
          送出
        </button>
      </form>
    </main>
  );
}
