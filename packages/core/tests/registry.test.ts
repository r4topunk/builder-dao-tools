import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  registerCommand,
  registerTool,
  getCommand,
  getCommands,
  getTool,
  getTools,
  resetRegistry,
} from "../src/registry.js";

describe("registry", () => {
  beforeEach(() => resetRegistry());

  it("registers and retrieves a command", () => {
    registerCommand({
      name: "foo",
      description: "Foo command",
      usage: "foo",
      run: async () => {},
    });
    const cmd = getCommand("foo");
    expect(cmd?.name).toBe("foo");
  });

  it("lists all commands in registration order", () => {
    registerCommand({ name: "a", description: "", usage: "", run: async () => {} });
    registerCommand({ name: "b", description: "", usage: "", run: async () => {} });
    expect(getCommands().map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("throws on duplicate command name", () => {
    registerCommand({ name: "x", description: "", usage: "", run: async () => {} });
    expect(() =>
      registerCommand({ name: "x", description: "", usage: "", run: async () => {} })
    ).toThrow(/already registered/);
  });

  it("registers and retrieves a tool", () => {
    registerTool({
      name: "t1",
      description: "Tool 1",
      inputSchema: z.object({ q: z.string() }),
      handler: async () => ({}),
    });
    expect(getTool("t1")?.name).toBe("t1");
    expect(getTools()).toHaveLength(1);
  });
});
