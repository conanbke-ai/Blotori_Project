import type { BlogDraft, PlatformId } from "../domain/types";

/** Local to this browser and origin. Nothing in this module uploads draft or image data. */
export interface DraftWorkspace {
  id: string;
  draft: BlogDraft;
  platformId: PlatformId;
  updatedAt: string;
}

export interface DraftImageAsset {
  draftId: string;
  imageId: string;
  /** Keep the original bytes, independently of any preview crop or object URL. */
  blob: Blob;
  name: string;
  updatedAt: string;
}

export type DraftStorageErrorCode = "unavailable" | "quota" | "corrupt" | "blocked" | "storage";

export class DraftStorageError extends Error {
  readonly code: DraftStorageErrorCode;

  constructor(code: DraftStorageErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DraftStorageError";
    this.code = code;
  }
}

const DATABASE_NAME = "blotori-draft-workspace";
const DATABASE_VERSION = 1;
const WORKSPACES = "workspaces";
const IMAGES = "images";
const META = "meta";
const ACTIVE_KEY = "activeWorkspace";
let databasePromise: Promise<IDBDatabase> | undefined;
// All mutations share one queue, including deletes and image replacements. A failure
// is returned to its caller but must not poison subsequent explicitly requested saves.
let mutationTail: Promise<void> = Promise.resolve();

function storageError(error: unknown): DraftStorageError {
  if (error instanceof DraftStorageError) return error;
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "QuotaExceededError") return new DraftStorageError("quota", "브라우저 저장 공간이 부족해요. 이전에 저장한 내용은 그대로 보관돼요.", error);
  if (name === "SecurityError" || name === "NotSupportedError" || name === "InvalidStateError") {
    return new DraftStorageError("unavailable", "이 브라우저에서 원고와 이미지의 로컬 저장소를 사용할 수 없어요.", error);
  }
  if (name === "DataCloneError" || name === "DataError" || name === "VersionError" || name === "NotFoundError") {
    return new DraftStorageError("corrupt", "저장 데이터 또는 저장소 형식을 확인할 수 없어요. 기존 데이터는 지우지 않았어요.", error);
  }
  return new DraftStorageError("storage", "브라우저에 저장하지 못했어요. 기존 데이터는 지우지 않았어요.", error);
}

function corrupt(message: string): never {
  throw new DraftStorageError("corrupt", message);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function oneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === "string" && choices.includes(value);
}
function optional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
const isString = (value: unknown) => typeof value === "string";
const alignment = (value: unknown) => oneOf(value, ["left", "center"]);

function validDraft(value: unknown): value is BlogDraft {
  if (!object(value) || !isString(value.title) || !isString(value.summary)
    || !strings(value.intro) || !strings(value.closing) || !strings(value.tags) || !strings(value.warnings)
    || !Array.isArray(value.sections) || !Array.isArray(value.images)
    || !optional(value.titleCandidates, strings)
    || !["titlePurpose", "styleUsed", "structureUsed", "layoutFingerprint"].every((key) => optional(value[key], isString))) return false;
  if (!optional(value.presentation, (p) => object(p) && optional(p.titleAlign, alignment) && optional(p.introAlign, alignment)
    && optional(p.density, (v) => oneOf(v, ["airy", "balanced", "dense"])))) return false;
  const sectionIds = new Set<string>();
  for (const section of value.sections) {
    if (!object(section) || !nonempty(section.id) || sectionIds.has(section.id) || !isString(section.heading) || !strings(section.paragraphs)) return false;
    sectionIds.add(section.id);
    if (!optional(section.presentation, (p) => object(p) && optional(p.headingAlign, alignment) && optional(p.bodyAlign, alignment)
      && optional(p.visualStyle, (v) => oneOf(v, ["standard", "key-point", "callout", "quote", "glossary"]))
      && optional(p.emphasis, (v) => Array.isArray(v) && v.every((e) => object(e) && isString(e.phrase) && oneOf(e.kind, ["bold", "accent", "highlight"]))))) return false;
  }
  const imageIds = new Set<string>();
  for (const image of value.images) {
    if (!object(image) || !nonempty(image.id) || imageIds.has(image.id)
      || !["label", "placement", "size", "prompt"].every((key) => isString(image[key]))
      || !(image.afterSectionId === null || nonempty(image.afterSectionId))
      || !oneOf(image.role, ["HERO", "CONTEXT", "EXPLAINER", "PROCESS", "TIP", "CAUTION"])
      || !oneOf(image.ratio, ["16:9", "4:3", "1:1", "4:5", "3:2"])
      || !optional(image.continuityMode, (v) => oneOf(v, ["independent", "series"]))
      || !optional(image.continuityGroup, (v) => v === null || isString(v))
      || !optional(image.referenceImageId, (v) => v === null || isString(v))
      || !optional(image.subjectProfile, isString)
      || !optional(image.display, (v) => object(v) && typeof v.widthPercent === "number" && [25, 50, 75, 100].includes(v.widthPercent)
        && oneOf(v.align, ["left", "center", "right"]))) return false;
    imageIds.add(image.id);
  }
  return optional(value.knowledgeGrounding, (v) => object(v) && typeof v.enabled === "boolean" && typeof v.used === "boolean"
    && v.provider === "openai-file-search" && strings(v.sourceNames) && typeof v.resultCount === "number" && Number.isFinite(v.resultCount));
}

function assertWorkspace(value: unknown): asserts value is DraftWorkspace {
  if (!object(value) || !nonempty(value.id) || !timestamp(value.updatedAt)
    || !oneOf(value.platformId, ["naver", "tistory", "blogger", "wordpress", "brunch", "other"]) || !validDraft(value.draft)) {
    corrupt("저장된 원고의 형식을 확인할 수 없어요. 기존 원고는 지우지 않았어요.");
  }
}
function assertImage(value: unknown): asserts value is DraftImageAsset {
  if (!object(value) || !nonempty(value.draftId) || !nonempty(value.imageId) || !nonempty(value.name)
    || !timestamp(value.updatedAt) || typeof Blob === "undefined" || !(value.blob instanceof Blob)) {
    corrupt("저장된 이미지의 형식을 확인할 수 없어요. 기존 이미지는 지우지 않았어요.");
  }
}
function assertId(value: unknown): asserts value is string {
  if (!nonempty(value)) corrupt("원고 또는 이미지의 식별자가 올바르지 않아요.");
}

function validateSchema(db: IDBDatabase): void {
  const tx = db.transaction([WORKSPACES, IMAGES, META], "readonly");
  const images = tx.objectStore(IMAGES);
  if (tx.objectStore(WORKSPACES).keyPath !== "id" || tx.objectStore(META).keyPath !== "key"
    || JSON.stringify(images.keyPath) !== JSON.stringify(["draftId", "imageId"])
    || images.index("draftId").keyPath !== "draftId" || images.index("draftId").unique) {
    corrupt("로컬 저장소의 형식이 달라 기존 데이터를 안전하게 읽을 수 없어요.");
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  let factory: IDBFactory;
  try {
    if (!globalThis.indexedDB) throw new DraftStorageError("unavailable", "이 브라우저에서 원고와 이미지의 로컬 저장소를 사용할 수 없어요.");
    factory = globalThis.indexedDB;
  } catch (error) {
    return Promise.reject(storageError(error));
  }
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let failed = false;
    const fail = (error: unknown) => { failed = true; reject(storageError(error)); };
    try { request = factory.open(DATABASE_NAME, DATABASE_VERSION); } catch (error) { fail(error); return; }
    request.onupgradeneeded = (event) => {
      try {
        // Only initialize a genuinely new database. Never repair a malformed schema
        // by deleting stores or changing a version behind the user's back.
        if (failed || event.oldVersion !== 0) {
          request.transaction?.abort();
          fail(new DraftStorageError("corrupt", "저장소 버전을 안전하게 변경할 수 없어요. 기존 데이터는 지우지 않았어요."));
          return;
        }
        const db = request.result;
        db.createObjectStore(WORKSPACES, { keyPath: "id" });
        db.createObjectStore(META, { keyPath: "key" });
        const images = db.createObjectStore(IMAGES, { keyPath: ["draftId", "imageId"] });
        images.createIndex("draftId", "draftId", { unique: false });
      } catch (error) {
        request.transaction?.abort();
        fail(error);
      }
    };
    request.onblocked = () => fail(new DraftStorageError("blocked", "다른 탭에서 로컬 저장소를 사용 중이에요. 다른 블로토리 탭을 닫고 다시 시도해 주세요."));
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      try { validateSchema(db); } catch (error) { db.close(); fail(error); return; }
      db.onversionchange = () => { db.close(); if (databasePromise === pending) databasePromise = undefined; };
      db.onclose = () => { if (databasePromise === pending) databasePromise = undefined; };
      resolve(db);
    };
  });
  databasePromise = pending;
  // A failed opening may be retried after permissions, quota, or another tab changes.
  void pending.catch(() => { if (databasePromise === pending) databasePromise = undefined; });
  return pending;
}

function transaction<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(stores, mode); } catch (error) { reject(storageError(error)); return; }
    let result: T;
    let setupError: unknown;
    tx.oncomplete = () => resolve(result);
    // Wait for abort, not an individual request error: callers must not announce a
    // successful save or start their next mutation before the entire transaction ends.
    tx.onabort = () => reject(storageError(setupError ?? tx.error));
    try { run(tx, (value) => { result = value; }); } catch (error) {
      setupError = error;
      try { tx.abort(); } catch { reject(storageError(error)); }
    }
  });
}

function mutate(operation: () => Promise<void>): Promise<void> {
  const next = mutationTail.then(operation);
  mutationTail = next.catch(() => undefined);
  return next;
}

/** Create once per newly generated draft; keep this ID through edits and platform changes. */
export function createDraftId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    return `draft-${Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (v) => v.toString(16).padStart(8, "0")).join("")}`;
  }
  throw new DraftStorageError("unavailable", "안전한 원고 식별자를 만들 수 없는 브라우저예요.");
}

export async function loadActiveWorkspace(): Promise<DraftWorkspace | null> {
  await mutationTail;
  const db = await openDatabase();
  const loaded = await transaction<{ pointer: unknown; workspace?: unknown; workspaceCount?: number }>(db, [META, WORKSPACES], "readonly", (tx, result) => {
    const request = tx.objectStore(META).get(ACTIVE_KEY);
    request.onsuccess = () => {
      const pointer: unknown = request.result;
      result({ pointer });
      if (pointer === undefined) {
        const countRequest = tx.objectStore(WORKSPACES).count();
        countRequest.onsuccess = () => result({ pointer, workspaceCount: countRequest.result });
      } else if (object(pointer) && nonempty(pointer.draftId)) {
        const workspaceRequest = tx.objectStore(WORKSPACES).get(pointer.draftId);
        workspaceRequest.onsuccess = () => result({ pointer, workspace: workspaceRequest.result });
      }
    };
  });
  if (loaded.pointer === undefined) {
    if (loaded.workspaceCount) corrupt("최근 원고 정보가 누락됐어요. 이전에 저장된 원고는 지우지 않았어요.");
    return null;
  }
  if (!object(loaded.pointer) || loaded.pointer.key !== ACTIVE_KEY || !nonempty(loaded.pointer.draftId)) corrupt("최근 원고 정보를 읽을 수 없어요. 기존 원고는 지우지 않았어요.");
  assertWorkspace(loaded.workspace);
  if (loaded.workspace.id !== loaded.pointer.draftId) corrupt("최근 원고의 식별자가 일치하지 않아요. 기존 원고는 지우지 않았어요.");
  return loaded.workspace;
}

export async function saveWorkspace(workspace: DraftWorkspace): Promise<void> {
  // Snapshot before waiting: mutable callers cannot change the payload of an already
  // queued save, and a slow older save cannot commit after a newer queued save.
  let snapshot: DraftWorkspace;
  try { assertWorkspace(workspace); snapshot = structuredClone(workspace); } catch (error) { throw storageError(error); }
  return mutate(async () => {
    const db = await openDatabase();
    await transaction<void>(db, [WORKSPACES, META], "readwrite", (tx) => {
      tx.objectStore(WORKSPACES).put(snapshot);
      tx.objectStore(META).put({ key: ACTIVE_KEY, draftId: snapshot.id });
    });
  });
}

export async function loadDraftImages(draftId: string): Promise<DraftImageAsset[]> {
  assertId(draftId);
  await mutationTail;
  const db = await openDatabase();
  const loaded = await transaction<unknown[]>(db, [IMAGES], "readonly", (tx, result) => {
    const request = tx.objectStore(IMAGES).index("draftId").getAll(draftId);
    request.onsuccess = () => result(request.result);
  });
  const assets: DraftImageAsset[] = [];
  for (const value of loaded) {
    assertImage(value);
    if (value.draftId !== draftId) corrupt("이미지와 원고의 식별자가 일치하지 않아요. 기존 이미지는 지우지 않았어요.");
    assets.push(value);
  }
  return assets;
}

export async function saveDraftImage(asset: DraftImageAsset): Promise<void> {
  let snapshot: DraftImageAsset;
  try { assertImage(asset); snapshot = structuredClone(asset); } catch (error) { throw storageError(error); }
  return mutate(async () => {
    const db = await openDatabase();
    await transaction<void>(db, [IMAGES], "readwrite", (tx) => { tx.objectStore(IMAGES).put(snapshot); });
  });
}

/** Removes only this image attachment. Other drafts and image plans are untouched. */
export async function deleteDraftImage(draftId: string, imageId: string): Promise<void> {
  assertId(draftId);
  assertId(imageId);
  return mutate(async () => {
    const db = await openDatabase();
    await transaction<void>(db, [IMAGES], "readwrite", (tx) => { tx.objectStore(IMAGES).delete([draftId, imageId]); });
  });
}
