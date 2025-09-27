import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { withX402Client } from "mcpay/client";
import { createSigner, isEvmSignerWallet } from "x402/types";

export const getClient = async () => {
  const client = new Client({
    name: "example-client",
    version: "1.0.0",
  });

  const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;
  const MCP_SERVER_URL = "http://localhost:3010/mcp"

  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));

  // ✅ Wait for the connection
  await client.connect(transport);

  
  console.log("EVM signer:", process.env.EVM_PRIVATE_KEY);

  const evmSigner = await createSigner("base-sepolia", EVM_PRIVATE_KEY);


  if (!isEvmSignerWallet(evmSigner)) {
    throw new Error("Failed to create EVM signer");
  }

  return withX402Client(client, {
    wallet: {
      evm: evmSigner,
    },
    confirmationCallback: async () => {
        return true
    }
  });
};

export const getClientResponse = async () => {
  const client = await getClient();

  const tools = await client.listTools();
  console.log("Tools:", JSON.stringify(tools, null, 2));

  // Start the game
  const startRes = await client.callTool({
    name: "start",
    arguments: {},
  });
  console.log("Game started:", startRes);

  // Simple AI strategy: try to play the snake game
  let gameOver = false;
  let moveCount = 0;
  const maxMoves = 100;

  while (!gameOver && moveCount < maxMoves) {
    try {
      // Simple AI: cycle through directions
      const directions = ["up", "right", "down", "left"];
      const direction = directions[moveCount % directions.length];
      
      console.log(`Move ${moveCount + 1}: Going ${direction}`);
      
      const moveRes = await client.callTool({
        name: direction,
        arguments: {},
      });
      
      console.log(`Move result:`, moveRes);
      
      // Check if game is over by looking for game over indicators in response
      const responseStr = JSON.stringify(moveRes);
      if (responseStr.includes("Game Over") || responseStr.includes("dead") || responseStr.includes("collision")) {
        console.log("Game over detected!");
        gameOver = true;
      }
      
      moveCount++;
      
      // Small delay between moves
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error on move ${moveCount + 1}:`, error);
      gameOver = true;
    }
  }

  // Get final leaderboard
  try {
    const leaderboardRes = await client.callTool({
      name: "leaderboard",
      arguments: {},
    });
    console.log("Final leaderboard:", leaderboardRes);
    return leaderboardRes;
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return startRes;
  }
};

try {
  console.log("[main] Starting test...");
  const response = await getClientResponse();
  console.log("[main] Final response:", response);
} catch (err) {
  console.error(err);
}