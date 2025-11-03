import { Mastra } from "@mastra/core/mastra";
import { PinoLogger, LogLevel } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import express from "express";
import dotenv from "dotenv";
import { a2aAgentRoute } from "./routes/a2a-agent-route";
import pino from "pino";

// Import our dictionary components
import { dictionaryWorkflow } from "./workflows/dictionary-workflow";
import { dictionaryAgent } from "./agents/dictionary-agent";
import {
  toolCallAppropriatenessScorer,
  completenessScorer,
  languagePairScorer,
} from "./scorers/dictionary-scorer";
import { getCacheStats } from "./tools/dictionary-tool";

// Load environment variables
dotenv.config();

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error(
    "GOOGLE_GENERATIVE_AI_API_KEY is required but not set in environment variables"
  );
  process.exit(1);
}
/**
 * Initialize Mastra instance with all our dictionary components
 */
export const mastra = new Mastra({
  workflows: { dictionaryWorkflow },
  agents: { dictionaryAgent },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    languagePairScorer,
  },
  storage: new LibSQLStore({
    url:
      process.env.NODE_ENV === "production" ? "file:../mastra.db" : ":memory:",
  }),
  logger: new PinoLogger({
    name: "Dictionary-Mastra",
    level: (process.env.LOG_LEVEL as LogLevel) || "info",
  }),
  telemetry: {
    enabled: false,
  },
  observability: {
    default: { enabled: true },
  },
  server: {
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
    apiRoutes: [a2aAgentRoute],
  },
});

/**
 * Express server for Telex.im integration
 */
const app = express();
app.use(express.json());

// CORS middleware for development
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

/**
 * Health Check Endpoint
 * Returns agent status and cache statistics
 */
app.get("/health", (req, res) => {
  const cacheStats = getCacheStats();
  res.json({
    status: "ok",
    agent: "Dictionary Agent",
    cache_size: cacheStats.size,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

/**
 * Main Agent Endpoint (A2A Protocol)
 * Handles incoming messages from Telex.im
 */
app.post("/agent", async (req, res) => {
  try {
    console.log("📨 Received message:", JSON.stringify(req.body, null, 2));

    const { message, channelId, userId } = req.body;

    // Validate required fields
    if (!message || typeof message !== "string") {
      console.error("❌ Invalid message format");
      return res.status(400).json({
        error: "Message is required and must be a string",
        text: "Please provide a valid message.",
        channelId: channelId || "unknown",
        timestamp: new Date().toISOString(),
      });
    }

    // Get the dictionary agent
    const agent = mastra.getAgent("dictionaryAgent");
    if (!agent) {
      throw new Error("Dictionary agent not found");
    }

    // Process the message with the agent
    // The agent will automatically select the right tool (translateTool or defineTool)
    const response = await agent.generate([
      {
        role: "user",
        content: message,
      },
    ]);

    // Extract text from response
    const responseText =
      response.text || "I apologize, but I could not process your request.";

    // Format A2A response
    const a2aResponse = {
      text: responseText,
      channelId: channelId || "default",
      timestamp: new Date().toISOString(),
    };

    console.log("📤 Sending response:", JSON.stringify(a2aResponse, null, 2));
    res.json(a2aResponse);
  } catch (error) {
    console.error("❌ Error processing message:", error);

    // Send user-friendly error message
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";

    res.status(500).json({
      error: errorMessage,
      text: "Sorry, I encountered an error processing your request. Please try again or rephrase your question.",
      channelId: req.body?.channelId || "unknown",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Cache Stats Endpoint
 * Returns current cache statistics
 */
app.get("/cache-stats", (req, res) => {
  const stats = getCacheStats();
  res.json({
    size: stats.size,
    keys: stats.keys,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Scheduled Vocabulary Tips
 * Sends a vocabulary tip at regular intervals
 */
const vocabularyTips = [
  {
    word: "serendipity",
    definition: "Finding something good without looking for it",
    translations: {
      es: "serendipia",
      fr: "sérendipité",
      de: "Serendipität",
    },
  },
  {
    word: "ephemeral",
    definition: "Lasting for a very short time",
    translations: {
      es: "efímero",
      fr: "éphémère",
      de: "flüchtig",
    },
  },
  {
    word: "eloquent",
    definition: "Fluent or persuasive in speaking or writing",
    translations: {
      es: "elocuente",
      fr: "éloquent",
      de: "beredt",
    },
  },
  {
    word: "resilient",
    definition: "Able to withstand or recover quickly from difficulties",
    translations: {
      es: "resistente",
      fr: "résilient",
      de: "widerstandsfähig",
    },
  },
  {
    word: "ambiguous",
    definition: "Open to more than one interpretation",
    translations: {
      es: "ambiguo",
      fr: "ambigu",
      de: "mehrdeutig",
    },
  },
];

let tipCounter = 0;
const VOCAB_TIP_INTERVAL = parseInt(process.env.VOCAB_TIP_INTERVAL || "300000"); // 5 minutes default

// Send vocabulary tips at regular intervals
setInterval(() => {
  const tip = vocabularyTips[tipCounter % vocabularyTips.length];

  console.log("\n" + "=".repeat(50));
  console.log("📚 VOCABULARY TIP #" + (tipCounter + 1));
  console.log("=".repeat(50));
  console.log(`\n🔤 Word: ${tip.word}`);
  console.log(`📖 Definition: ${tip.definition}`);
  console.log("\n🌍 Translations:");
  console.log(`  • Spanish (es): ${tip.translations.es}`);
  console.log(`  • French (fr): ${tip.translations.fr}`);
  console.log(`  • German (de): ${tip.translations.de}`);
  console.log("\n" + "=".repeat(50) + "\n");

  // TODO: In production, send this to a Telex channel via webhook
  // Example:
  // if (process.env.TELEX_WEBHOOK_URL) {
  //   fetch(process.env.TELEX_WEBHOOK_URL, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ text: vocabularyTipMessage })
  //   });
  // }

  tipCounter++;
}, VOCAB_TIP_INTERVAL);

const PORT = process.env.PORT || 8000;

app.listen(3001, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 DICTIONARY AGENT STARTED");
  console.log("=".repeat(60));
  console.log(`\n📡 Server running on port ${PORT}`);
  console.log(
    `⏰ Vocabulary tips every ${VOCAB_TIP_INTERVAL / 1000 / 60} minutes`
  );
  console.log(
    `💾 Storage: ${process.env.NODE_ENV === "production" ? "Persistent (file)" : "In-Memory"}`
  );
  console.log("\n📍 Endpoints:");
  console.log(`  • GET  http://localhost:${PORT}/health`);
  console.log(`  • POST http://localhost:${PORT}/agent (Telex A2A)`);
  console.log(`  • POST http://localhost:${PORT}/workflow (Direct workflow)`);
  console.log(`  • GET  http://localhost:${PORT}/cache-stats`);
  console.log("\n" + "=".repeat(60) + "\n");
});
