import { z } from "zod";
import { createCompletenessScorer } from "@mastra/evals/scorers/code";
import { createScorer } from "@mastra/core/scores";

/**
 * Tool Call Appropriateness Scorer
 * Checks if the agent called the correct tool (translateTool or defineTool)
 */
export const toolCallAppropriatenessScorer = createScorer({
  name: "Tool Call Appropriateness",
  description:
    "Checks if the agent called an appropriate tool (translateTool or defineTool)",
  type: "agent",
  judge: {
    model: "google/gemini-2.0-flash-exp",
    instructions:
      "You are evaluating if the agent called an appropriate tool for the task. Return only the structured JSON matching the provided schema.",
  },
})
  .preprocess(({ run }) => {
    const toolCalls =
      (run.output as any)?.toolCalls ||
      (run.output as any)?.[0]?.toolCalls ||
      [];
    const expectedTools = ["translateTool", "defineTool"];
    return { toolCalls, expectedTools };
  })
  .analyze({
    description:
      "Verify if the tool called is appropriate for the dictionary agent",
    outputSchema: z.object({
      appropriateTool: z.boolean(),
      toolCalled: z.string().optional(),
      explanation: z.string().default(""),
    }),
    createPrompt: ({ results }) => `
You are evaluating if a dictionary agent called an appropriate tool.

Tool calls made:
"""
${JSON.stringify(results.preprocessStepResult.toolCalls, null, 2)}
"""

Expected appropriate tools: ${results.preprocessStepResult.expectedTools.join(", ")}

Tasks:
1) Determine if a tool was called
2) Check if the called tool is one of the expected tools
3) Return appropriateTool as true if it matches, false otherwise

Return JSON with fields:
{
  "appropriateTool": boolean,
  "toolCalled": string (optional),
  "explanation": string
}
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return r.appropriateTool ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Tool appropriateness: appropriateTool=${r.appropriateTool ?? false}, toolCalled=${r.toolCalled ?? "none"}, score=${score}. ${r.explanation ?? ""}`;
  });

/**
 * Completeness Scorer
 * Evaluates if the agent's response is complete and answers the user's question
 */
export const completenessScorer = createCompletenessScorer();

/**
 * Language Pair Accuracy Scorer
 * Custom scorer to verify translation requests use correct language pairs
 */
export const languagePairScorer = createScorer({
  name: "Language Pair Accuracy",
  description:
    "Checks that translation requests use valid source and target language pairs",
  type: "agent",
  judge: {
    model: "google/gemini-2.0-flash-exp",
    instructions:
      "You are an expert evaluator of language translation requests. " +
      "Determine whether the assistant correctly identified the source and target languages " +
      "based on the user's request and used them appropriately in the translation tool. " +
      "Return only the structured JSON matching the provided schema.",
  },
})
  .preprocess(({ run }) => {
    const userText = (run.input?.inputMessages?.[0]?.content as string) || "";
    const assistantText = (run.output?.[0]?.content as string) || "";
    const toolCalls =
      (run.output as any)?.toolCalls ||
      (run.output as any)?.[0]?.toolCalls ||
      [];
    return { userText, assistantText, toolCalls };
  })
  .analyze({
    description: "Verify language pair selection matches user intent",
    outputSchema: z.object({
      userRequestedTranslation: z.boolean(),
      correctLanguagePair: z.boolean(),
      sourceLangCorrect: z.boolean(),
      targetLangCorrect: z.boolean(),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(""),
    }),
    createPrompt: ({ results }) => `
You are evaluating if a dictionary assistant correctly identified language pairs for translation.

User request:
"""
${results.preprocessStepResult.userText}
"""

Assistant response:
"""
${results.preprocessStepResult.assistantText}
"""

Tool calls made:
"""
${JSON.stringify(results.preprocessStepResult.toolCalls, null, 2)}
"""

Tasks:
1) Determine if the user requested a translation
2) If yes, check if the assistant used the correct source language (what language the text is in)
3) Check if the assistant used the correct target language (what language to translate to)
4) Verify the language pair makes sense for the request

Common language codes:
- en = English
- es = Spanish
- fr = French
- de = German
- it = Italian
- pt = Portuguese
- ru = Russian
- ja = Japanese
- zh = Chinese

Return JSON with fields:
{
  "userRequestedTranslation": boolean,
  "correctLanguagePair": boolean,
  "sourceLangCorrect": boolean,
  "targetLangCorrect": boolean,
  "confidence": number, // 0-1
  "explanation": string
}
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};

    // If not a translation request, full credit (not applicable)
    if (!r.userRequestedTranslation) return 1;

    // If correct language pair, give high score
    if (r.correctLanguagePair && r.sourceLangCorrect && r.targetLangCorrect) {
      return Math.max(0.9, Math.min(1, 0.9 + 0.1 * (r.confidence ?? 1)));
    }

    // Partial credit if one language is correct
    if (r.sourceLangCorrect || r.targetLangCorrect) {
      return 0.5;
    }

    // Wrong language pair
    return 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return (
      `Language pair scoring: userRequestedTranslation=${r.userRequestedTranslation ?? false}, ` +
      `correctPair=${r.correctLanguagePair ?? false}, ` +
      `sourceCorrect=${r.sourceLangCorrect ?? false}, ` +
      `targetCorrect=${r.targetLangCorrect ?? false}, ` +
      `confidence=${r.confidence ?? 0}. Score=${score}. ${r.explanation ?? ""}`
    );
  });

export const scorers = {
  toolCallAppropriatenessScorer,
  completenessScorer,
  languagePairScorer,
};
