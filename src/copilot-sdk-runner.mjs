#!/usr/bin/env node
// =============================================================
// Copilot SDK Runner
// =============================================================
// Copilot CLI を SDK 経由でプログラマティックに呼び出すスクリプト。
// GitHub Actions ワークフローから実行される。
//
// 環境変数:
//   COPILOT_GITHUB_TOKEN   - GitHub PAT（Copilot 権限付き）
//   COPILOT_PROMPT         - 実行するプロンプト
//   COPILOT_MODEL          - 使用するモデル（デフォルト: claude-opus-4.6）
//   COPILOT_MAX_RETRIES    - 最大試行回数（デフォルト: 2 = 初回 + リトライ1回）
//   COPILOT_RETRY_DELAY    - リトライ待機秒数（デフォルト: 10）
//   COPILOT_TIMEOUT_MS     - sendAndWait タイムアウト ms（デフォルト: 600000 = 10分）
//
// 使い方:
//   COPILOT_GITHUB_TOKEN=xxx COPILOT_PROMPT="..." node src/copilot-sdk-runner.mjs
// =============================================================

import { CopilotClient } from "@github/copilot-sdk";

// --- ユーティリティ ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isCI = !!process.env.CI || !!process.env.GITHUB_ACTIONS;

/** 経過時間を "Xs" または "Xm Ys" 形式で返す */
function elapsed(startMs) {
  const sec = Math.floor((Date.now() - startMs) / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

// --- 設定 ---
const prompt = process.env.COPILOT_PROMPT;
const model = process.env.COPILOT_MODEL || "claude-opus-4.6";
const maxRetries = parseInt(process.env.COPILOT_MAX_RETRIES || "2", 10);
const retryDelaySec = parseInt(process.env.COPILOT_RETRY_DELAY || "10", 10);
const timeoutMs = parseInt(process.env.COPILOT_TIMEOUT_MS || "600000", 10);
// ハートビート間隔: CI では30秒、ローカルでは60秒
const heartbeatIntervalMs = isCI ? 30_000 : 60_000;

if (!prompt) {
  console.error("❌ COPILOT_PROMPT 環境変数が設定されていません");
  process.exit(1);
}

if (!process.env.COPILOT_GITHUB_TOKEN) {
  console.error("❌ COPILOT_GITHUB_TOKEN 環境変数が設定されていません");
  process.exit(1);
}

// --- 起動情報 ---
console.log("🤖 Copilot SDK Runner");
console.log(`🖥️  Node.js: ${process.version}  |  Platform: ${process.platform}`);
console.log(`🌍 Environment: ${isCI ? "GitHub Actions (CI)" : "Local"}`);
console.log(`📝 Prompt: ${prompt}`);
console.log(`🧠 Model: ${model}`);
console.log(`🔄 Max retries: ${maxRetries}（初回含む）`);
console.log(`⏱️  Timeout: ${timeoutMs / 1000}s  |  Heartbeat: ${heartbeatIntervalMs / 1000}s`);
console.log("");

// --- SDK クライアント初期化 ---
console.log("🔌 CopilotClient 初期化中...");
const clientStartMs = Date.now();
const client = new CopilotClient();
console.log(`✅ CopilotClient 初期化完了 (${elapsed(clientStartMs)})`);
console.log("");

try {
  let response = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // --- セッション作成 ---
      const sessionStartMs = Date.now();
      console.log(`📡 [${attempt}/${maxRetries}] セッション作成中...`);

      const session = await client.createSession({
        model,
        onPermissionRequest: async (request) => {
          console.log(`🔧 Tool permission: ${request.toolName ?? "unknown"} → approved`);
          return { kind: "approved" };
        },
      });

      const sessionKeys = Object.keys(session ?? {}).join(", ");
      console.log(`✅ セッション作成完了 (${elapsed(sessionStartMs)})`);
      console.log(`   session keys: [${sessionKeys || "none"}]`);
      console.log("");

      // --- sendAndWait + ハートビート ---
      console.log("🚀 プロンプト送信中...");
      const sendStartMs = Date.now();

      // sendAndWait 中に定期的に生存報告を出すタイマー
      let heartbeatCount = 0;
      const heartbeat = setInterval(() => {
        heartbeatCount++;
        console.log(`💓 [heartbeat #${heartbeatCount}] 待機中... (${elapsed(sendStartMs)} elapsed)`);
      }, heartbeatIntervalMs);

      try {
        response = await session.sendAndWait({ prompt }, timeoutMs);
      } finally {
        clearInterval(heartbeat);
      }

      console.log(`📨 sendAndWait 完了 (${elapsed(sendStartMs)})`);

      // --- クリーンアップ ---
      await session.destroy();
      console.log("🗑️  セッション破棄完了");

      if (response) {
        console.log("");
        console.log("=".repeat(60));
        console.log("📄 Response:");
        console.log("=".repeat(60));
        console.log(response.data.content);
        console.log("");
        console.log(`✅ セッション終了（attempt ${attempt}/${maxRetries} で成功、合計 ${elapsed(sessionStartMs)})`);
        break;
      } else {
        throw new Error("レスポンスが空でした");
      }
    } catch (err) {
      lastError = err;
      console.error(`⚠️ [${attempt}/${maxRetries}] 失敗: ${err.message}`);
      if (err.code) console.error(`   Error code: ${err.code}`);
      if (err.stack) console.error(err.stack);

      if (attempt < maxRetries) {
        console.log(`⏳ ${retryDelaySec}秒後にリトライします...`);
        await sleep(retryDelaySec * 1000);
      }
    }
  }

  // すべてリトライ失敗
  if (!response) {
    console.error(`❌ ${maxRetries}回すべて失敗しました`);
    if (lastError) {
      console.error("最後のエラー:", lastError.message);
      console.error(lastError.stack);
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error("❌ 予期しないエラー:", error.message);
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await client.stop();
  process.exit(process.exitCode || 0);
}
