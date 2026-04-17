import type { z } from "zod";
import type { RunContext } from "./context.js";

export interface CliCommand {
  name: string;
  description: string;
  usage: string;
  run(args: string[], ctx: RunContext): Promise<void>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler(input: unknown, ctx: RunContext): Promise<unknown>;
}

const commands = new Map<string, CliCommand>();
const commandOrder: string[] = [];
const tools = new Map<string, McpTool>();
const toolOrder: string[] = [];

export function registerCommand(cmd: CliCommand): void {
  if (commands.has(cmd.name)) {
    throw new Error(`Command '${cmd.name}' is already registered`);
  }
  commands.set(cmd.name, cmd);
  commandOrder.push(cmd.name);
}

export function registerTool(tool: McpTool): void {
  if (tools.has(tool.name)) {
    throw new Error(`Tool '${tool.name}' is already registered`);
  }
  tools.set(tool.name, tool);
  toolOrder.push(tool.name);
}

export function getCommand(name: string): CliCommand | undefined {
  return commands.get(name);
}

export function getCommands(): CliCommand[] {
  return commandOrder.map((n) => commands.get(n)!).filter(Boolean);
}

export function getTool(name: string): McpTool | undefined {
  return tools.get(name);
}

export function getTools(): McpTool[] {
  return toolOrder.map((n) => tools.get(n)!).filter(Boolean);
}

export function resetRegistry(): void {
  commands.clear();
  commandOrder.length = 0;
  tools.clear();
  toolOrder.length = 0;
}
