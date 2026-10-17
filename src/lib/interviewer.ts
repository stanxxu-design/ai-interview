// 前後端共用的型別與常數（不可放入任何伺服器端機密）

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const MAX_JOB_DESCRIPTION_LENGTH = 8000;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_MESSAGES = 80;

/** 面試官結束面試時，會在回覆最後輸出此標記，前端偵測到後自動進入評分 */
export const END_MARKER = "[[INTERVIEW_COMPLETE]]";

export type Verdict = "強烈推薦" | "推薦" | "待考慮" | "不推薦";

export type Evaluation = {
  overallScore: number; // 0-100
  verdict: Verdict;
  summary: string;
  dimensions: { name: string; score: number; comment: string }[]; // score 0-10
  strengths: string[];
  improvements: string[];
  questionReviews: {
    question: string;
    answerSummary: string;
    feedback: string;
    betterAnswer: string;
  }[];
  nextSteps: string[];
};

/** 移除結束標記；串流中途若只收到一半的標記也一併隱藏 */
export function stripEndMarker(text: string): { text: string; ended: boolean } {
  const ended = text.includes(END_MARKER);
  let clean = text.replace(END_MARKER, "");
  for (let i = END_MARKER.length - 1; i > 0; i--) {
    if (clean.endsWith(END_MARKER.slice(0, i))) {
      clean = clean.slice(0, -i);
      break;
    }
  }
  return { text: clean.trimEnd(), ended };
}
