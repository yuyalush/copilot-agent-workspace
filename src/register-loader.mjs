// =============================================================
// ESM Import Fix Loader
// =============================================================
// vscode-jsonrpc/node → vscode-jsonrpc/node.js のリダイレクト。
// @github/copilot-sdk が拡張子なしで import しているが、
// Node.js 22 の ESM 解決では .js が必須なため補完する。
//
// 使い方:
//   node --import ./src/register-loader.mjs src/copilot-sdk-runner.mjs
// =============================================================

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./esm-loader.mjs", pathToFileURL(import.meta.url));
