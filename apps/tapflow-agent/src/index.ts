import { readTapflowAgentConfig } from "./config.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTapflowAgentBridge, type JsonRpcRequest, type JsonRpcResponse } from "./bridge.js";

const config = readTapflowAgentConfig();
const bridge = createTapflowAgentBridge(config);
const rl = createInterface({ input, output, terminal: false });

function writeMessage(message: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  return bridge.handleRequest(request);
}

for await (const line of rl) {
  if (!line.trim()) continue;
  const request = JSON.parse(line) as JsonRpcRequest;
  try {
    writeMessage(await handleRequest(request));
  } catch (error) {
    writeMessage({
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      id: request.id ?? null,
      jsonrpc: "2.0",
    });
  }
}
