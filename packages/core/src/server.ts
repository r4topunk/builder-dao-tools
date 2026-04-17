import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { resolveConfig } from "./config.js";
import { createContext } from "./context.js";
import { registerCoreCommands } from "./tools/register-core.js";
import { getTools } from "./registry.js";
import { createMcpResponse, type OutputFormat } from "./utils/encoder.js";

export async function createServer() {
  registerCoreCommands();
  try {
    // @ts-expect-error optional addon
    await import("@builder-dao/cli-search");
  } catch {
    // Addon not installed
  }

  const config = resolveConfig(process.argv.slice(2), process.env);
  const ctx = createContext(config);

  const server = new McpServer({
    name: "builder-dao",
    version: "0.1.0",
  });

  for (const tool of getTools()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (params: unknown) => {
        try {
          const result = await tool.handler(params, ctx);
          const fmt: OutputFormat =
            typeof params === "object" && params !== null && "format" in params
              ? ((params as { format?: OutputFormat }).format ?? "json")
              : "json";
          return createMcpResponse(result, fmt);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      }
    );
  }

  return { server, ctx };
}

export async function runServer(): Promise<void> {
  const { server } = await createServer();

  const argv = process.argv.slice(2);
  const sseFlag = argv.includes("--sse");
  const port = sseFlag ? parseInt(process.env.MCP_PORT || "3100", 10) : null;

  if (port) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);

    const httpServer = createHttpServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
      res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://localhost:${port}`);
      if (url.pathname === "/mcp" || url.pathname === "/") {
        await transport.handleRequest(req, res);
      } else if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", mode: "streamable-http", port }));
      } else {
        res.writeHead(404);
        res.end("Not found.");
      }
    });

    httpServer.listen(port, () => {
      console.error(`MCP server running on http://localhost:${port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
