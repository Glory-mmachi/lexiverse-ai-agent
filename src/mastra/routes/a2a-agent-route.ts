import { registerApiRoute } from "@mastra/core/server";
import { randomUUID } from "crypto";

type Part = {
  kind: "text" | "data";
  text?: string;
  data?: any;
};

type Message = {
  role: string;
  parts: Part[];
  messageId?: string;
  taskId?: string;
};

type Params = {
  message?: Message;
  messages?: Message[];
  contextId?: string;
  taskId?: string;
  metadata?: any;
};

type JsonRpcRequest = {
  jsonrpc: string;
  id: string | number | null;
  method: string;
  params?: Params;
};

type Artifact = {
  artifactId: string;
  name: string;
  parts: Part[];
};

export const a2aAgentRoute = registerApiRoute("/a2a/agent/:agentId", {
  method: "POST",
  handler: async (c) => {
    try {
      const mastra = c.get("mastra");
      const agentId = c.req.param("agentId");

      
      const body = (await c.req.json()) as JsonRpcRequest;

      console.log("📨 A2A Request:", JSON.stringify(body, null, 2));

      // Handle empty request
      if (Object.keys(body).length === 0) {
        return c.json({
          jsonrpc: "2.0",
          id: "",
          result: {
            id: randomUUID(),
            contextId: randomUUID(),
            status: {
              state: "completed",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [
                  {
                    kind: "text",
                    text: "A2A endpoint is working! Send a 'message/send' request with your query.",
                  },
                ],
                kind: "message",
              },
            },
            artifacts: [
              {
                artifactId: randomUUID(),
                name: "assistantResponse",
                parts: [
                  { kind: "text", text: "Ready to process your requests!" },
                ],
              },
            ],
            history: [],
            kind: "task",
          },
        });
      }

      const { jsonrpc, id: requestId, method, params } = body;

      // Handle unknown methods
      if (method && !["message/send", "generate"].includes(method)) {
        return c.json({
          jsonrpc: "2.0",
          id: requestId || "",
          result: {
            id: randomUUID(),
            contextId: randomUUID(),
            status: {
              state: "failed",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [
                  {
                    kind: "text",
                    text: "Unknown method. Use 'message/send' or 'generate'.",
                  },
                ],
                kind: "message",
              },
            },
            artifacts: [
              {
                artifactId: randomUUID(),
                name: "assistantResponse",
                parts: [
                  {
                    kind: "text",
                    text: "Unknown method. Use 'message/send' or 'generate'.",
                  },
                ],
              },
            ],
            history: [],
            kind: "task",
          },
        });
      }

      if (jsonrpc !== "2.0") {
        return c.json({
          jsonrpc: "2.0",
          id: requestId || "",
          result: {
            id: randomUUID(),
            contextId: randomUUID(),
            status: {
              state: "failed",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [
                  {
                    kind: "text",
                    text: 'Invalid Request: jsonrpc must be "2.0"',
                  },
                ],
                kind: "message",
              },
            },
            artifacts: [
              {
                artifactId: randomUUID(),
                name: "assistantResponse",
                parts: [
                  {
                    kind: "text",
                    text: 'Invalid Request: jsonrpc must be "2.0"',
                  },
                ],
              },
            ],
            history: [],
            kind: "task",
          },
        });
      }

      const agent = mastra.getAgent(agentId);
      if (!agent) {
        return c.json({
          jsonrpc: "2.0",
          id: requestId || "",
          result: {
            id: randomUUID(),
            contextId: randomUUID(),
            status: {
              state: "failed",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [
                  {
                    kind: "text",
                    text: `Agent '${agentId}' not found`,
                  },
                ],
                kind: "message",
              },
            },
            artifacts: [
              {
                artifactId: randomUUID(),
                name: "assistantResponse",
                parts: [
                  {
                    kind: "text",
                    text: `Agent '${agentId}' not found`,
                  },
                ],
              },
            ],
            history: [],
            kind: "task",
          },
        });
      }

      const { message, messages, contextId, taskId, metadata } = params || {};

      let messagesList: Message[] = [];
      if (message) {
        messagesList = [message];
      } else if (messages && Array.isArray(messages)) {
        messagesList = messages;
      }

      if (messagesList.length === 0) {
        return c.json({
          jsonrpc: "2.0",
          id: requestId,
          result: {
            id: taskId || randomUUID(),
            contextId: contextId || randomUUID(),
            status: {
              state: "completed",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [
                  {
                    kind: "text",
                    text: "I'm ready to help! Send me a message to translate or define words.",
                  },
                ],
                kind: "message",
              },
            },
            artifacts: [
              {
                artifactId: randomUUID(),
                name: "assistantResponse",
                parts: [
                  {
                    kind: "text",
                    text: "Send a message in the 'messages' parameter to get started.",
                  },
                ],
              },
            ],
            history: [],
            kind: "task",
          },
        });
      }

      // Convert A2A messages to Mastra format
      const mastraMessages = messagesList.map((msg) => {
        const content =
          msg.parts
            ?.map((part: Part) => {
              if (part.kind === "text") return part.text;
              if (part.kind === "data") return JSON.stringify(part.data);
              return "";
            })
            .join("\n") || "";
        return `${msg.role}: ${content}`;
      });

      // Execute agent
      const response = await agent.generate(mastraMessages);
      const agentText = response.text || "";

      
      const artifacts = [
        {
          artifactId: randomUUID(),
          name: `${agentId}Response`,
          parts: [{ kind: "text", text: agentText }],
        },
      ];

   

      // Build conversation history
      const history = [
        ...messagesList.map((msg) => ({
          kind: "message",
          role: msg.role,
          parts: msg.parts,
          messageId: msg.messageId || randomUUID(),
          taskId: msg.taskId || taskId || randomUUID(),
        })),
        {
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: agentText }],
          messageId: randomUUID(),
          taskId: taskId || randomUUID(),
        },
      ];

      // Return A2A-compliant response
      return c.json({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          id: taskId || randomUUID(),
          contextId: contextId || randomUUID(),
          status: {
            state: "completed",
            timestamp: new Date().toISOString(),
            message: {
              messageId: randomUUID(),
              role: "agent",
              parts: [{ kind: "text", text: agentText }],
              kind: "message",
            },
          },
          artifacts,
          history,
          kind: "task",
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return c.json({
        jsonrpc: "2.0",
        id: "",
        result: {
          id: randomUUID(),
          contextId: randomUUID(),
          status: {
            state: "failed",
            timestamp: new Date().toISOString(),
            message: {
              messageId: randomUUID(),
              role: "agent",
              parts: [
                {
                  kind: "text",
                  text: "Internal server error occurred.",
                },
              ],
              kind: "message",
            },
          },
          artifacts: [
            {
              artifactId: randomUUID(),
              name: "assistantResponse",
              parts: [
                {
                  kind: "text",
                  text: "Internal server error occurred.",
                },
              ],
            },
          ],
          history: [],
          kind: "task",
        },
      });
    }
  },
});
