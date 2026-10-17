import type { ChatMessage } from "@/lib/interviewer";
import { ai, geminiErrorResponse, MODEL, parseInterviewRequest, toGeminiContents } from "@/lib/gemini";
import { buildInterviewerPrompt } from "@/lib/prompts";

// 固定以這句開場，Gemini 的對話需以 user 角色開頭
const OPENING: ChatMessage = { role: "user", content: "（候選人已進入面試室，請開始面試）" };

export async function POST(request: Request) {
  const parsed = await parseInterviewRequest(request);
  if (!parsed.ok) return parsed.response;
  const { jobDescription, messages } = parsed;

  try {
    const result = await ai.models.generateContentStream({
      model: MODEL,
      contents: toGeminiContents([OPENING, ...messages]),
      config: {
        systemInstruction: buildInterviewerPrompt(jobDescription),
        abortSignal: request.signal,
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result) {
            const text = chunk.text;
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return geminiErrorResponse(error, "/api/interview");
  }
}
