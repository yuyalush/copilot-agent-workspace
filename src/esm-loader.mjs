// =============================================================
// Custom ESM Loader — 拡張子なし subpath import の修正
// =============================================================
// vscode-jsonrpc パッケージが exports マップで ./node サブパスを
// 定義していないため、Node.js 22 で ERR_MODULE_NOT_FOUND になる。
// このローダーで vscode-jsonrpc/node → vscode-jsonrpc/node.js に補完する。
// =============================================================

export function resolve(specifier, context, nextResolve) {
  if (specifier === "vscode-jsonrpc/node") {
    return nextResolve("vscode-jsonrpc/node.js", context);
  }
  return nextResolve(specifier, context);
}
