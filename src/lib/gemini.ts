import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES,
  type ChatMessage,
} from "@/lib/interviewer";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

/** 將對話紀錄轉成 Gemini 格式（Gemini 的 AI 角色叫 "model"） */
export function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length <= MAX_MESSAGE_LENGTH
  );
}

type ParsedRequest =
  | { ok: true; jobDescription: string; messages: ChatMessage[] }
  | { ok: false; response: Response };

/** 驗證前端送來的 { jobDescription, messages } */
export async function parseInterviewRequest(request: Request): Promise<ParsedRequest> {
  const fail = (error: string, status = 400) => ({
    ok: false as const,
    response: Response.json({ error }, { status }),
  });

  if (!process.env.GEMINI_API_KEY) return fail("伺服器未設定 GEMINI_API_KEY", 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("請求格式錯誤");
  }

  const { jobDescription, messages = [] } = (body ?? {}) as {
    jobDescription?: unknown;
    messages?: unknown;
  };

  if (typeof jobDescription !== "string" || !jobDescription.trim()) {
    return fail("請提供職缺描述");
  }
  if (jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
    return fail(`職缺描述不可超過 ${MAX_JOB_DESCRIPTION_LENGTH} 字`);
  }
  if (
    !Array.isArray(messages) ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isChatMessage)
  ) {
    return fail("對話內容格式錯誤");
  }

  return { ok: true, jobDescription: jobDescription.trim(), messages };
}

/** 將 Gemini 錯誤轉換成給使用者看的訊息 */
export function geminiErrorResponse(error: unknown, scope: string): Response {
  console.error(`[${scope}]`, error);
  if (error instanceof ApiError) {
    if (error.status === 400 && /api key/i.test(error.message)) {
      return Response.json({ error: "Gemini API Key 無效" }, { status: 502 });
    }
    if (error.status === 401 || error.status === 403) {
      return Response.json({ error: "Gemini API Key 沒有存取權限" }, { status: 502 });
    }
    if (error.status === 429) {
      return Response.json({ error: "Gemini 請求太頻繁或額度已用完，請稍後再試" }, { status: 429 });
    }
  }
  return Response.json({ error: "AI 面試官暫時無法回應，請稍後再試" }, { status: 502 });
}
