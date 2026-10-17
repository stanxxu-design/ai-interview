import type { ReactNode } from "react";
import type { Evaluation, Verdict } from "@/lib/interviewer";

const VERDICT_STYLES: Record<Verdict, string> = {
  強烈推薦: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  推薦: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  待考慮: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  不推薦: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function scoreColor(ratio: number) {
  if (ratio >= 0.75) return "bg-emerald-500";
  if (ratio >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items, marker }: { items: string[]; marker: string }) {
  return (
    <ul className="space-y-2 text-sm leading-6">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden>{marker}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function EvaluationReport({ evaluation }: { evaluation: Evaluation }) {
  const { overallScore, verdict, summary, dimensions } = evaluation;

  return (
    <div className="space-y-5">
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 p-6 text-center sm:flex-row sm:text-left dark:border-zinc-800">
        <div className="flex size-28 shrink-0 flex-col items-center justify-center rounded-full border-8 border-blue-600/20">
          <span className="text-4xl font-bold">{overallScore}</span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
        <div className="sm:ml-4">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${VERDICT_STYLES[verdict] ?? VERDICT_STYLES["待考慮"]}`}
          >
            {verdict}
          </span>
          <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{summary}</p>
        </div>
      </section>

      <Section title="各面向評分">
        <div className="space-y-4">
          {dimensions.map((d) => (
            <div key={d.name}>
              <div className="flex justify-between text-sm">
                <span className="font-medium">{d.name}</span>
                <span className="text-zinc-500">{d.score} / 10</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full ${scoreColor(d.score / 10)}`}
                  style={{ width: `${d.score * 10}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{d.comment}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-5 sm:grid-cols-2">
        <Section title="表現亮點">
          <BulletList items={evaluation.strengths} marker="✅" />
        </Section>
        <Section title="待改進之處">
          <BulletList items={evaluation.improvements} marker="⚠️" />
        </Section>
      </div>

      <Section title="逐題檢討">
        <div className="space-y-3">
          {evaluation.questionReviews.map((q, i) => (
            <details
              key={i}
              className="group rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900"
              open={i === 0}
            >
              <summary className="cursor-pointer font-medium">
                Q{i + 1}. {q.question}
              </summary>
              <dl className="mt-3 space-y-3 leading-6">
                <div>
                  <dt className="text-xs font-medium text-zinc-500">你的回答</dt>
                  <dd>{q.answerSummary}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-zinc-500">回饋</dt>
                  <dd>{q.feedback}</dd>
                </div>
                <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 dark:bg-blue-950/40">
                  <dt className="text-xs font-medium text-blue-700 dark:text-blue-300">建議回答方向</dt>
                  <dd className="whitespace-pre-wrap">{q.betterAnswer}</dd>
                </div>
              </dl>
            </details>
          ))}
        </div>
      </Section>

      <Section title="下一步準備建議">
        <BulletList items={evaluation.nextSteps} marker="👉" />
      </Section>
    </div>
  );
}
