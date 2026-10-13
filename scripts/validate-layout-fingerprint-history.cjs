const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const originalTsLoader = Module._extensions[".ts"];
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

try {
  const history = require(path.join(process.cwd(), "lib/domain/layout-history.ts"));
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const savedKey = history.savedStyleLayoutHistoryKey("style-a");
  const foodKey = history.categoryPresetLayoutHistoryKey("food-photo-diary");
  const travelKey = history.categoryPresetLayoutHistoryKey("travel-photo-story");
  assert.equal(savedKey, "blotori.layout-history.v1:style-a", "saved-style key must stay backward compatible");
  assert.notEqual(foodKey, travelKey);
  assert.notEqual(savedKey, foodKey);

  for (let index = 1; index <= 7; index++) history.rememberLayoutFingerprint(storage, foodKey, `food-layout-${index}`);
  history.rememberLayoutFingerprint(storage, travelKey, "travel-layout-1");
  history.rememberLayoutFingerprint(storage, savedKey, "saved-layout-1");
  assert.deepEqual(history.loadLayoutHistory(storage, foodKey), [
    "food-layout-2", "food-layout-3", "food-layout-4", "food-layout-5", "food-layout-6", "food-layout-7",
  ]);
  assert.deepEqual(history.loadLayoutHistory(storage, travelKey), ["travel-layout-1"]);
  assert.deepEqual(history.loadLayoutHistory(storage, savedKey), ["saved-layout-1"]);

  const reconnectedStorage = {
    getItem: storage.getItem,
    setItem: storage.setItem,
  };
  assert.deepEqual(history.loadLayoutHistory(reconnectedStorage, foodKey), history.loadLayoutHistory(storage, foodKey));
  history.rememberLayoutFingerprint(reconnectedStorage, foodKey, "food-layout-8");
  assert.deepEqual(history.loadLayoutHistory(storage, foodKey), [
    "food-layout-3", "food-layout-4", "food-layout-5", "food-layout-6", "food-layout-7", "food-layout-8",
  ]);
  assert.deepEqual(history.rememberLayoutFingerprint(storage, foodKey, "  "), history.loadLayoutHistory(storage, foodKey));

  const blockedStorage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("SecurityError"); },
  };
  assert.deepEqual(history.loadLayoutHistory(blockedStorage, foodKey), []);
  assert.deepEqual(history.rememberLayoutFingerprint(blockedStorage, foodKey, "blocked-layout"), ["blocked-layout"]);
  values.set(travelKey, "{broken-json");
  assert.deepEqual(history.loadLayoutHistory(storage, travelKey), []);
  assert.deepEqual(history.rememberLayoutFingerprint(storage, travelKey, "recovered-layout"), ["recovered-layout"]);

  console.log("LAYOUT_FINGERPRINT_HISTORY_PASS", JSON.stringify({
    maxHistory: history.loadLayoutHistory(storage, foodKey).length,
    isolatedPresetKeys: true,
    savedStyleBackwardCompatible: true,
    refreshReconnectPersistent: true,
    blockedStorageSafe: true,
    corruptStorageRecovered: true,
  }));
} finally {
  if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
  else delete Module._extensions[".ts"];
}
