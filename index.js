#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";

const CHAR_LIMIT = 40_000;

const server = new McpServer({ name: "bigread-mcp", version: "1.0.1" });

server.tool(
  "bigread",
  "Returns chunk offsets and limits for reading a large file with Claude Code's Read tool without triggering output truncation. Does not return file content — just the reading plan.",
  { filePath: z.string().describe("Absolute path to the file") },
  async ({ filePath }) => {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;
    const totalChars = content.length;

    if (totalChars <= CHAR_LIMIT) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ fits: true }),
        }],
      };
    }

    const linesPerChunk = Math.floor(CHAR_LIMIT / (totalChars / totalLines));
    const chunks = [];
    for (let i = 0; i < totalLines; i += linesPerChunk) {
      chunks.push({
        offset: i + 1,
        limit: Math.min(linesPerChunk, totalLines - i),
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(chunks),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
