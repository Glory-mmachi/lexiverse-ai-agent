import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { dictionaryAgent } from "./agents/dictionary-agent";
import { dictionaryWorkflow } from "./workflows/dictionary-workflow";
import { a2aAgentRoute } from "./routes/a2a-agent-route";
import {
  completenessScorer,
  languagePairScorer,
  toolCallAppropriatenessScorer,
} from "./scorers/dictionary-scorer";

export const mastra = new Mastra({
  agents: { dictionaryAgent },
  workflows: { dictionaryWorkflow },
  storage: new LibSQLStore({ url: ":memory:" }),
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    languagePairScorer,
  },

  logger: new PinoLogger({
    name: "Mastra",
    level: "debug",
  }),
  telemetry: { enabled: false },
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
