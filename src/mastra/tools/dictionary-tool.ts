import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// In-memory cache for translations and definitions
const cache = new Map<string, any>();

// Interfaces for API responses
interface TranslationResponse {
  responseData: {
    translatedText: string;
  };
  responseStatus: number;
}

interface DictionaryResponse {
  meanings: {
    partOfSpeech: string;
    definitions: {
      definition: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
  word: string;
  phonetic?: string;
  phonetics?: {
    text?: string;
    audio?: string;
  }[];
  origin?: string;
}

/**
 * Enhanced Translation Tool
 * Uses MyMemory Translation API (free, no key required)
 * Supports 40+ languages including African languages!
 */
export const translateTool = createTool({
  id: "translate-text",
  description:
    "Translate text between 40+ languages with rich contextual information. " +
    "Supported languages include: " +
    "European (en, es, fr, de, it, pt, nl, sv, no, da, fi, pl, cs, ro, hu, el), " +
    "Asian (zh, ja, ko, hi, ar, th, vi, id), " +
    "African (ig-Igbo, yo-Yoruba, ha-Hausa, sw-Swahili, zu-Zulu, xh-Xhosa, am-Amharic), " +
    "and others (ru, tr, fa, he). " +
    "Returns translation plus metadata for contextual enrichment.",
  inputSchema: z.object({
    text: z.string().describe("The text to translate"),
    sourceLang: z
      .string()
      .describe("Source language code (e.g., en, es, ig for Igbo)"),
    targetLang: z
      .string()
      .describe("Target language code (e.g., en, es, ig for Igbo)"),
  }),
  outputSchema: z.object({
    original: z.string(),
    translation: z.string(),
    sourceLang: z.string(),
    targetLang: z.string(),
    cached: z.boolean(),
    metadata: z.object({
      sourceLanguageName: z.string(),
      targetLanguageName: z.string(),
      isPhrasal: z.boolean(),
      wordCount: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { text, sourceLang, targetLang } = context;

    // Validate inputs
    if (!text || !sourceLang || !targetLang) {
      throw new Error(
        "Text, source language, and target language are required"
      );
    }

    const cacheKey = `translate:${text}:${sourceLang}:${targetLang}`;

    const languageNames: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      nl: "Dutch",
      sv: "Swedish",
      no: "Norwegian",
      da: "Danish",
      fi: "Finnish",
      pl: "Polish",
      cs: "Czech",
      ro: "Romanian",
      hu: "Hungarian",
      el: "Greek",
      zh: "Chinese",
      ja: "Japanese",
      ko: "Korean",
      hi: "Hindi",
      ar: "Arabic",
      th: "Thai",
      vi: "Vietnamese",
      id: "Indonesian",
      ig: "Igbo",
      yo: "Yoruba",
      ha: "Hausa",
      sw: "Swahili",
      zu: "Zulu",
      xh: "Xhosa",
      am: "Amharic",
      ru: "Russian",
      tr: "Turkish",
      fa: "Persian",
      he: "Hebrew",
    };

    // Check cache first
    if (cache.has(cacheKey)) {
      console.log("📦 Cache hit for translation");
      const cached = cache.get(cacheKey);
      return {
        ...cached,
        cached: true,
      };
    }

    try {
      // Call MyMemory Translation API
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status}`);
      }

      const data = (await response.json()) as TranslationResponse;

      if (data.responseStatus !== 200 && !data.responseData) {
        throw new Error("Translation not available for this language pair");
      }

      // Enhanced metadata
      const wordCount = text.trim().split(/\s+/).length;
      const isPhrasal = wordCount > 1;

      const result = {
        original: text,
        translation: data.responseData.translatedText,
        sourceLang,
        targetLang,
        cached: false,
        metadata: {
          sourceLanguageName: languageNames[sourceLang] || sourceLang,
          targetLanguageName: languageNames[targetLang] || targetLang,
          isPhrasal,
          wordCount,
        },
      };

      // Cache the result
      cache.set(cacheKey, result);
      console.log("🌐 Translation fetched and cached");

      return result;
    } catch (error) {
      console.error("Translation error:", error);
      throw new Error(
        `Failed to translate: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});

/**
 * Definition Tool
 */
export const defineTool = createTool({
  id: "define-word",
  description:
    "Get comprehensive definition of an English word including part of speech, meanings, examples, pronunciation, etymology (origin), synonyms, and antonyms. Perfect for deep word understanding.",
  inputSchema: z.object({
    word: z.string().describe("The English word to define"),
  }),
  outputSchema: z.object({
    word: z.string(),
    phonetic: z.string().optional(),
    origin: z.string().optional(),
    meanings: z.array(
      z.object({
        partOfSpeech: z.string(),
        definition: z.string(),
        example: z.string().optional(),
        synonyms: z.array(z.string()).optional(),
        antonyms: z.array(z.string()).optional(),
      })
    ),
    cached: z.boolean(),
  }),
  execute: async ({ context }) => {
    const { word } = context;

    // Validate input
    if (!word || word.trim().length === 0) {
      throw new Error("Word is required");
    }

    const normalizedWord = word.toLowerCase().trim();
    const cacheKey = `define:${normalizedWord}`;

    // Check cache first
    if (cache.has(cacheKey)) {
      console.log("📦 Cache hit for definition");
      return {
        ...cache.get(cacheKey),
        cached: true,
      };
    }

    try {
      // Call Dictionary API
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            `No definition found for "${word}". Please check the spelling or try another word.`
          );
        }
        throw new Error(`Dictionary API error: ${response.status}`);
      }

      const data = (await response.json()) as DictionaryResponse[];

      if (!data || data.length === 0) {
        throw new Error(`No definition found for "${word}"`);
      }

      const firstEntry = data[0];

      // Extract phonetic 
      const phonetic =
        firstEntry.phonetic || firstEntry.phonetics?.[0]?.text || undefined;

      // Extract origin/etymology
      const origin = firstEntry.origin;

      // Extract all meanings with their details
      const meanings = firstEntry.meanings.flatMap((meaning) => {
        return meaning.definitions.slice(0, 3).map((def) => {
        
          const synonyms = [
            ...(def.synonyms || []),
            ...(meaning.synonyms || []),
          ]
            .filter((s, i, arr) => arr.indexOf(s) === i) 
            .slice(0, 5); 

          const antonyms = [
            ...(def.antonyms || []),
            ...(meaning.antonyms || []),
          ]
            .filter((a, i, arr) => arr.indexOf(a) === i)
            .slice(0, 5);

          return {
            partOfSpeech: meaning.partOfSpeech,
            definition: def.definition,
            example: def.example,
            synonyms: synonyms.length > 0 ? synonyms : undefined,
            antonyms: antonyms.length > 0 ? antonyms : undefined,
          };
        });
      });

      const result = {
        word: firstEntry.word,
        phonetic,
        origin,
        meanings,
        cached: false,
      };

      // Cache the result
      cache.set(cacheKey, result);
      console.log("📚 Definition fetched and cached");

      return result;
    } catch (error) {
      console.error("Definition error:", error);
      throw new Error(
        `Failed to get definition: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
};

/**
 * Clear cache (useful for testing)
 */
export const clearCache = () => {
  cache.clear();
  console.log("🗑️ Cache cleared");
};
