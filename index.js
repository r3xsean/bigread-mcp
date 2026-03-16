#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";

const CHAR_LIMIT = 40_000; // safe margin under 50K persisted-output threshold

const server = new McpServer({ name: "bigread-mcp", version: "1.0.0" });

server.tool(
  "bigread",
  "Returns chunk offsets and limits for reading a large file with Claude Code's Read tool without triggering output truncation. Does not return file content — just the reading plan. Call this when a Read tool result shows 'Output too large' with a persisted-output tag.",
  { filePath: z.string().describe("Absolute path to the file") },
  async ({ filePath }) => {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const totalChars = content.length;
    const totalLines = lines.length;

    // If the file fits in one read, say so
    if (totalChars <= CHAR_LIMIT) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            totalLines,
            totalChars,
            fits: true,
            message: "File fits in a single Read call — no chunking needed.",
          }, null, 2),
        }],
      };
    }

    const charsPerLine = totalChars / totalLines;
    const linesPerChunk = Math.floor(CHAR_LIMIT / charsPerLine);

    const chunks = [];
    for (let i = 0; i < totalLines; i += linesPerChunk) {
      chunks.push({
        offset: i + 1, // Read tool uses 1-based line numbers
        limit: Math.min(linesPerChunk, totalLines - i),
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          totalLines,
          totalChars,
          charsPerLine: Math.round(charsPerLine),
          linesPerChunk,
          chunks,
        }, null, 2),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
