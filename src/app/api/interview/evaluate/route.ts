import type { Evaluation } from "@/lib/interviewer";
import { ai, geminiErrorResponse, MODEL, parseInterviewRequest } from "@/lib/gemini";
import { buildEvaluatorPrompt, formatTranscript } from "@/lib/prompts";

const stringArray = { type: "array", items: { type: "string" } } as const;

// 結構化輸出：要求 Gemini 回傳完全符合此 JSON Schema 的結果
const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "overallScore",
    "verdict",
    "summary",
    "dimensions",
    "strengths",
    "improvements",
    "questionReviews",
    "nextSteps",
  ],
  properties: {
    overallScore: { type: "integer" },
    verdict: { type: "string", enum: ["強烈推薦", "推薦", "待考慮", "不推薦"] },
    summary: { type: "string" },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "score", "comment"],
        properties: {
          name: { type: "string" },
          score: { type: "integer" },
          comment: { type: "string" },
        },
      },
    },
    strengths: stringArray,
    improvements: stringArray,
    questionReviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answerSummary", "feedback", "betterAnswer"],
        properties: {
          question: { type: "string" },
          answerSummary: { type: "string" },
          feedback: { type: "string" },
          betterAnswer: { type: "string" },
        },
      },
    },
    nextSteps: stringArray,
  },
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));

export async function POST(request: Request) {
  const parsed = await parseInterviewRequest(request);
  if (!parsed.ok) return parsed.response;
  const { jobDescription, messages } = parsed;

  if (!messages.some((m) => m.role === "user")) {
    return Response.json({ error: "候選人尚未回答任何問題，無法評分" }, { status: 400 });
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `以下是完整的面試逐字稿：\n<transcript>\n${formatTranscript(messages)}\n</transcript>`,
      config: {
        systemInstruction: buildEvaluatorPrompt(jobDescription),
        responseMimeType: "application/json",
        responseJsonSchema: EVALUATION_SCHEMA,
        abortSignal: request.signal,
      },
    });

    const content = response.text;
    if (!content) throw new Error("Empty evaluation response");

    const evaluation = JSON.parse(content) as Evaluation;
    evaluation.overallScore = clamp(evaluation.overallScore, 0, 100);
    evaluation.dimensions = evaluation.dimensions.map((d) => ({
      ...d,
      score: clamp(d.score, 0, 10),
    }));

    return Response.json(evaluation);
  } catch (error) {
    return geminiErrorResponse(error, "/api/interview/evaluate");
  }
}
