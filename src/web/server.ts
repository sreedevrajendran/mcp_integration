import cors from "cors";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGeminiAgent } from "../agent/gemini-client.js";
import { CONFIG } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const publicDir = path.resolve(projectRoot, "public");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

/**
 * Health & Configuration Status
 */
app.get("/api/status", (_req, res) => {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "");
  const hasGitHubToken = Boolean(CONFIG.githubToken && CONFIG.githubToken.trim() !== "");
  const localIp = getLocalIp();

  res.json({
    hasGeminiKey,
    hasGitHubToken,
    projectsDir: CONFIG.projectsDir,
    localIp,
    port: process.env.PORT || 3000,
  });
});

/**
 * Save API keys directly into .env
 */
app.post("/api/settings", (req, res) => {
  try {
    const { geminiApiKey, githubToken } = req.body;
    const envPath = path.resolve(projectRoot, ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    if (geminiApiKey) {
      process.env.GEMINI_API_KEY = geminiApiKey;
      if (/^GEMINI_API_KEY=/m.test(envContent)) {
        envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${geminiApiKey}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${geminiApiKey}\n`;
      }
    }

    if (githubToken) {
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN = githubToken;
      if (/^GITHUB_PERSONAL_ACCESS_TOKEN=/m.test(envContent)) {
        envContent = envContent.replace(
          /^GITHUB_PERSONAL_ACCESS_TOKEN=.*$/m,
          `GITHUB_PERSONAL_ACCESS_TOKEN=${githubToken}`
        );
      } else {
        envContent += `\nGITHUB_PERSONAL_ACCESS_TOKEN=${githubToken}\n`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
    fs.chmodSync(envPath, 0o600);

    res.json({ success: true, message: "Settings saved successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Chat with Gemini AI Agent with autonomous tool execution
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [], apiKey: clientApiKey, model = "gemini-3.8-flash" } = req.body;

    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      return res.status(400).json({
        error: "MISSING_GEMINI_API_KEY",
        message:
          "Gemini API key is required. You can get a free key at https://aistudio.google.com/apikey and save it in the settings modal.",
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message string is required." });
    }

    const agentResult = await runGeminiAgent({
      apiKey: apiKey.trim(),
      message,
      history,
      model,
    });

    res.json({
      success: true,
      text: agentResult.text,
      toolCalls: agentResult.toolCalls,
    });
  } catch (err: any) {
    console.error("Agent error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  const localIp = getLocalIp();
  console.log("=".repeat(60));
  console.log("  Gemini AI Agent Web & Mobile Server Running!");
  console.log(`  • Laptop Browser:  http://localhost:${PORT}`);
  console.log(`  • Mobile Browser:  http://${localIp}:${PORT}`);
  console.log("=".repeat(60));
});

export { app, server };
