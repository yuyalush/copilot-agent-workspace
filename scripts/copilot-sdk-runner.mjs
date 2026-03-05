#!/usr/bin/env node
// =============================================================
// Copilot SDK Runner
// =============================================================
// Copilot CLI を SDK 経由でプログラマティックに呼び出すスクリプト。
// GitHub Actions ワークフローから実行される。
//
// 環境変数:
//   COPILOT_GITHUB_TOKEN - GitHub PAT（Copilot 権限付き）
//   COPILOT_PROMPT       - 実行するプロンプト
//   COPILOT_MODEL        - 使用するモデル（デフォルト: claude-opus-4.6）
//
// 使い方:
//   COPILOT_GITHUB_TOKEN=xxx COPILOT_PROMPT="..." node scripts/copilot-sdk-runner.mjs
// =============================================================

import { CopilotClient } from "@github/copilot-sdk";

// --- 設定 ---
const prompt = process.env.COPILOT_PROMPT;
const model = process.env.COPILOT_MODEL || "claude-opus-4.6";

if (!prompt) {
  console.error("❌ COPILOT_PROMPT 環境変数が設定されていません");
  process.exit(1);
}

if (!process.env.COPILOT_GITHUB_TOKEN) {
  console.error("❌ COPILOT_GITHUB_TOKEN 環境変数が設定されていません");
  process.exit(1);
}

console.log("🤖 Copilot SDK Runner");
console.log(`📝 Prompt: ${prompt}`);
console.log(`🧠 Model: ${model}`);
console.log("");

// --- SDK クライアント初期化 ---
// COPILOT_GITHUB_TOKEN は SDK が自動で読み取る
const client = new CopilotClient();

try {
  // --- セッション作成 ---
  console.log("📡 セッション作成中...");
  const session = await client.createSession({
    model,
    // --allow-all 相当: すべてのツール実行を自動承認
    onPermissionRequest: async (request) => {
      console.log(`🔧 Tool permission: ${request.toolName ?? "unknown"} → approved`);
      return { kind: "approved" };
    },
  });
  console.log("✅ セッション作成完了");

  // --- プロンプト送信 & 完了待ち ---
  console.log("🚀 プロンプト送信中...");
  const response = await session.sendAndWait(
    { prompt },
    600000 // タイムアウト: 10分
  );

  if (response) {
    console.log("");
    console.log("=".repeat(60));
    console.log("📄 Response:");
    console.log("=".repeat(60));
    console.log(response.data.content);
  } else {
    console.log("⚠️ レスポンスが空でした");
  }

  // --- クリーンアップ ---
  await session.destroy();
  console.log("✅ セッション終了");
} catch (error) {
  console.error("❌ エラー:", error.message);
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await client.stop();
  process.exit(process.exitCode || 0);
}
