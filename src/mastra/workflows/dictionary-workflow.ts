import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

/**
 * Step 1: Translate a word or phrase
 * This step handles the translation logic
 */
const translateStep = createStep({
  id: "translate-step",
  description: "Translates text from source language to target language",
  inputSchema: z.object({
    text: z.string().describe("Text to translate"),
    sourceLang: z.string().describe("Source language code"),
    targetLang: z.string().describe("Target language code"),
    generateExamples: z
      .boolean()
      .optional()
      .describe("Whether to generate usage examples"),
  }),
  outputSchema: z.object({
    original: z.string(),
    translation: z.string(),
    sourceLang: z.string(),
    targetLang: z.string(),
    generateExamples: z.boolean().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    const { text, sourceLang, targetLang } = inputData;

    // Call MyMemory Translation API
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Translation API returned status ${response.status}`);
    }

    const data = await response.json();

    if (data.responseStatus !== 200 && !data.responseData) {
      throw new Error("Translation not available");
    }

    return {
      original: text,
      translation: data.responseData.translatedText,
      sourceLang,
      targetLang,
    };
  },
});

/**
 * Step 2: Generate contextual usage examples
 * Uses the agent to provide usage examples for the translated phrase
 */
const generateExamplesStep = createStep({
  id: "generate-examples",
  description: "Generates usage examples for the translated text",
  inputSchema: z.object({
    original: z.string(),
    translation: z.string(),
    sourceLang: z.string(),
    targetLang: z.string(),
    generateExamples: z.boolean().optional(),
  }),
  outputSchema: z.object({
    translation: z.string(),
    examples: z.string().optional(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error("Translation data not found");
    }

    // Only generate examples if generateExamples is true
    if (!inputData.generateExamples) {
      return {
        translation: inputData.translation,
        examples: undefined,
      };
    }

    const agent = mastra?.getAgent("dictionaryAgent");
    if (!agent) {
      throw new Error("Dictionary agent not found");
    }

    const prompt = `Given the translation below, provide 2-3 natural usage examples in the target language with English translations:

Original (${inputData.sourceLang}): ${inputData.original}
Translation (${inputData.targetLang}): ${inputData.translation}

Format your response as:

📝 USAGE EXAMPLES

1. [Example sentence in target language]
    → [English translation]

2. [Example sentence in target language]
    → [English translation]

3. [Example sentence in target language]
    → [English translation]

Keep examples natural and practical for everyday conversation.`;

    const response = await agent.stream([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let examplesText = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      examplesText += chunk;
    }

    return {
      translation: inputData.translation,
      examples: examplesText,
    };
  },
});

/**
 * Dictionary Workflow
 * Translates text and optionally generates usage examples
 */
export const dictionaryWorkflow = createWorkflow({
  id: "dictionary-workflow",
  inputSchema: z.object({
    text: z.string().describe("Text to translate"),
    sourceLang: z.string().describe("Source language code"),
    targetLang: z.string().describe("Target language code"),
    generateExamples: z
      .boolean()
      .optional()
      .describe("Whether to generate usage examples"),
  }),
  outputSchema: z.object({
    translation: z.string(),
    examples: z.string().optional(),
  }),
})
  .then(translateStep)
  .then(generateExamplesStep);

dictionaryWorkflow.commit();
