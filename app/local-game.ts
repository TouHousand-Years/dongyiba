import {
  compareGuess,
  normalizeName,
  type CharacterValue,
  type GuessFeedback,
  type TagDefinition,
} from "./game-core";
import {
  getActiveCharacters,
  getActiveTags,
  createStandardGameCatalog,
  loadLocalCatalog,
  toTagDefinitions,
  type LocalCatalog,
  type LocalCharacter,
  type LocalStorageLike,
} from "./local-catalog";

export type LocalGameMode = "daily" | "unlimited" | "custom";

export type LocalGuess = {
  id: number;
  name: string;
  guessedAt: number | null;
  elapsedMs: number | null;
  feedback: GuessFeedback[];
};

export type UnlimitedRound = {
  round: number;
  answer: string;
  attempts: number;
  won: boolean;
  durationMs: number;
};

export type LocalGame = {
  sessionId: string;
  createdAt: number | null;
  dayKey: string;
  challengeNumber: number;
  mode: LocalGameMode;
  excludedFromHistory: boolean;
  maxAttempts: number;
  answerCharacterId: number;
  names: string[];
  tags: TagDefinition[];
  attempts: number;
  completed: boolean;
  won: boolean | null;
  timerStartedAt: number | null;
  elapsedMs: number;
  unlimitedRunId: string | null;
  unlimitedRound: number;
  unlimitedElapsedMs: number;
  unlimitedHistory: UnlimitedRound[];
  guesses: LocalGuess[];
};

export type GameRecord = {
  schemaVersion: 1;
  sessionId: string;
  createdAt: number | null;
  startedAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  dayKey: string;
  challengeNumber: number;
  mode: LocalGameMode;
  maxAttempts: number;
  unlimitedRunId: string | null;
  unlimitedRound: number;
  answerCharacterId: number;
  answerName: string;
  candidateNames: string[];
  tags: TagDefinition[];
  guesses: LocalGuess[];
  completed: boolean;
  won: boolean | null;
  durationMs: number;
};

export type TimingStats = {
  completedSessionIds: string[];
  winDurationsMs: number[];
  winAttempts: number[];
};

export type LocalGuessResult =
  | { ok: true; game: LocalGame; guess: LocalGuess; message: string; answer: string | null }
  | { ok: false; error: string };

const GAME_STORAGE_KEY = "dongyiba:games:v1";
const GAME_RECORDS_STORAGE_KEY = "dongyiba:game-records:v1";
const TIMING_STORAGE_KEY = "dongyiba:timing:v1";
const OBFUSCATED_STORAGE_PREFIX = "dyb-obf-v1:";
const OBFUSCATION_KEY = new TextEncoder().encode("dongyiba-local-record");

function isContinuousMode(mode: LocalGameMode): boolean {
  return mode === "unlimited" || mode === "custom";
}

export function loadGameCatalog(
  mode: LocalGameMode,
  storage: LocalStorageLike | null = getBrowserStorage(),
): LocalCatalog {
  return mode === "custom" ? loadLocalCatalog(storage) : createStandardGameCatalog();
}

function obfuscateGameData(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    const chunk = bytes.slice(offset, offset + 0x8000);
    const obfuscated = chunk.map((byte, index) => (
      byte ^ OBFUSCATION_KEY[(offset + index) % OBFUSCATION_KEY.length]
    ));
    binary += String.fromCharCode(...obfuscated);
  }
  return `${OBFUSCATED_STORAGE_PREFIX}${btoa(binary)}`;
}

function parseStoredGameData(raw: string): unknown {
  if (!raw.startsWith(OBFUSCATED_STORAGE_PREFIX)) return JSON.parse(raw);
  const binary = atob(raw.slice(OBFUSCATED_STORAGE_PREFIX.length));
  const bytes = Uint8Array.from(binary, (character, index) => (
    character.charCodeAt(0) ^ OBFUSCATION_KEY[index % OBFUSCATION_KEY.length]
  ));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getBrowserStorage(): LocalStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function shanghaiDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function challengeNumber(day: string): number {
  return Math.floor(
    (Date.parse(`${day}T00:00:00+08:00`) - Date.parse("2024-01-01T00:00:00+08:00")) / 86400000,
  ) + 1;
}

function dayHash(day: string): number {
  return [...day].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function newSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createLocalGame(catalog: LocalCatalog, mode: LocalGameMode, now = Date.now()): LocalGame {
  return createLocalGameWithAnswer(catalog, mode, now, null, false);
}

function createLocalGameWithAnswer(
  catalog: LocalCatalog,
  mode: LocalGameMode,
  now: number,
  specifiedAnswer: LocalCharacter | null,
  excludedFromHistory: boolean,
): LocalGame {
  const characters = getActiveCharacters(catalog);
  const tags = getActiveTags(catalog);
  if (!characters.length || !tags.length) throw new Error("题库尚未配置完成。");

  const day = shanghaiDay();
  const index = mode === "daily"
    ? dayHash(day) % characters.length
    : Math.floor(Math.random() * characters.length);

  return {
    sessionId: newSessionId(),
    createdAt: now,
    dayKey: day,
    challengeNumber: challengeNumber(day),
    mode,
    excludedFromHistory,
    maxAttempts: 8,
    answerCharacterId: specifiedAnswer?.id ?? characters[index].id,
    names: characters.map((character) => character.name),
    tags: toTagDefinitions(tags),
    attempts: 0,
    completed: false,
    won: null,
    timerStartedAt: null,
    elapsedMs: 0,
    unlimitedRunId: isContinuousMode(mode) ? newSessionId() : null,
    unlimitedRound: 1,
    unlimitedElapsedMs: 0,
    unlimitedHistory: [],
    guesses: [],
  };
}

type StoredGuess = Omit<LocalGuess, "guessedAt" | "elapsedMs"> & {
  guessedAt?: number | null;
  elapsedMs?: number | null;
};

function isOptionalTime(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (
    typeof value === "number" && Number.isFinite(value) && value >= 0
  );
}

function isStoredGuess(value: unknown): value is StoredGuess {
  if (!value || typeof value !== "object") return false;
  const guess = value as Partial<StoredGuess>;
  return Number.isInteger(guess.id) && typeof guess.name === "string" &&
    isOptionalTime(guess.guessedAt) && isOptionalTime(guess.elapsedMs) && Array.isArray(guess.feedback);
}

function normalizeStoredGame(value: unknown, mode: LocalGameMode, catalog: LocalCatalog): LocalGame | null {
  if (!value || typeof value !== "object") return null;
  const stored = value as Partial<LocalGame>;
  const characters = getActiveCharacters(catalog);
  const tags = getActiveTags(catalog);
  if (
    stored.mode !== mode ||
    typeof stored.sessionId !== "string" ||
    typeof stored.dayKey !== "string" ||
    !Number.isInteger(stored.answerCharacterId) ||
    !characters.some((character) => character.id === stored.answerCharacterId) ||
    !Array.isArray(stored.guesses) ||
    !stored.guesses.every(isStoredGuess) ||
    stored.guesses.length > 8
  ) return null;
  if (mode === "daily" && stored.dayKey !== shanghaiDay()) return null;

  const storedGuesses = stored.guesses as StoredGuess[];
  const firstKnownGuessAt = storedGuesses.find((guess) => guess.guessedAt !== null && guess.guessedAt !== undefined)?.guessedAt ?? null;
  const guesses: LocalGuess[] = storedGuesses.map((guess) => ({
    ...guess,
    guessedAt: guess.guessedAt ?? null,
    elapsedMs: guess.elapsedMs ?? (
      guess.guessedAt !== null && guess.guessedAt !== undefined && firstKnownGuessAt !== null
        ? Math.max(0, guess.guessedAt - firstKnownGuessAt)
        : null
    ),
  }));
  const answerCharacterId = Number(stored.answerCharacterId);
  const attempts = guesses.length;
  const completed = stored.completed === true || attempts >= 8;
  const elapsedMs = typeof stored.elapsedMs === "number" && Number.isFinite(stored.elapsedMs) && stored.elapsedMs >= 0
    ? stored.elapsedMs
    : 0;
  const timerStartedAt = !completed
    ? (typeof stored.timerStartedAt === "number" && Number.isFinite(stored.timerStartedAt)
      ? stored.timerStartedAt
      : guesses.length > 0 ? Date.now() : null)
    : null;
  const unlimitedHistory = Array.isArray(stored.unlimitedHistory)
    ? stored.unlimitedHistory.filter((item): item is UnlimitedRound => {
      if (!item || typeof item !== "object") return false;
      const round = item as Partial<UnlimitedRound>;
      return Number.isInteger(round.round) && typeof round.answer === "string" &&
        Number.isInteger(round.attempts) && typeof round.won === "boolean" &&
        Number.isFinite(round.durationMs) && Number(round.durationMs) >= 0;
    })
    : [];
  return {
    sessionId: stored.sessionId,
    createdAt: isOptionalTime(stored.createdAt) ? (stored.createdAt ?? firstKnownGuessAt) : firstKnownGuessAt,
    dayKey: stored.dayKey,
    challengeNumber: challengeNumber(stored.dayKey),
    mode,
    excludedFromHistory: stored.excludedFromHistory === true,
    maxAttempts: 8,
    answerCharacterId,
    names: characters.map((character) => character.name),
    tags: toTagDefinitions(tags),
    attempts,
    completed,
    won: completed
      ? (typeof stored.won === "boolean" ? stored.won : guesses.some((guess) => guess.id === answerCharacterId))
      : null,
    timerStartedAt,
    elapsedMs,
    unlimitedRunId: isContinuousMode(mode)
      ? (typeof stored.unlimitedRunId === "string" ? stored.unlimitedRunId : stored.sessionId)
      : null,
    unlimitedRound: isContinuousMode(mode) && Number.isInteger(stored.unlimitedRound)
      ? Math.max(1, Number(stored.unlimitedRound))
      : 1,
    unlimitedElapsedMs: isContinuousMode(mode) && typeof stored.unlimitedElapsedMs === "number" && Number.isFinite(stored.unlimitedElapsedMs)
      ? Math.max(0, stored.unlimitedElapsedMs)
      : 0,
    unlimitedHistory,
    guesses,
  };
}

export function getElapsedMs(game: LocalGame, now = Date.now()): number {
  return Math.max(0, game.elapsedMs + (game.timerStartedAt === null ? 0 : now - game.timerStartedAt));
}

export function createNextUnlimitedGame(catalog: LocalCatalog, previous: LocalGame, now = Date.now()): LocalGame {
  if (!isContinuousMode(previous.mode) || !previous.completed) {
    throw new Error("只有已结束的无限或自定义模式对局可以进入下一轮。");
  }
  const next = createLocalGame(catalog, previous.mode, now);
  const answer = getLocalAnswerName(catalog, previous);
  return {
    ...next,
    unlimitedRunId: previous.unlimitedRunId ?? previous.sessionId,
    unlimitedRound: previous.unlimitedRound + 1,
    unlimitedElapsedMs: previous.unlimitedElapsedMs + previous.elapsedMs,
    unlimitedHistory: [
      ...previous.unlimitedHistory,
      {
        round: previous.unlimitedRound,
        answer,
        attempts: previous.attempts,
        won: previous.won === true,
        durationMs: previous.elapsedMs,
      },
    ],
  };
}

function emptyTimingStats(): TimingStats {
  return { completedSessionIds: [], winDurationsMs: [], winAttempts: [] };
}

export function loadTimingStats(
  storage: LocalStorageLike | null = getBrowserStorage(),
): TimingStats {
  if (!storage) return emptyTimingStats();
  try {
    const raw = storage.getItem(TIMING_STORAGE_KEY);
    if (!raw) return emptyTimingStats();
    const value = JSON.parse(raw) as Partial<TimingStats>;
    return {
      completedSessionIds: Array.isArray(value.completedSessionIds)
        ? value.completedSessionIds.filter((item): item is string => typeof item === "string")
        : [],
      winDurationsMs: Array.isArray(value.winDurationsMs)
        ? value.winDurationsMs.filter((item): item is number => Number.isFinite(item) && item >= 0)
        : [],
      winAttempts: Array.isArray(value.winAttempts)
        ? value.winAttempts.filter((item): item is number => Number.isInteger(item) && item > 0)
        : [],
    };
  } catch {
    return emptyTimingStats();
  }
}

export function recordCompletedTiming(
  game: LocalGame,
  storage: LocalStorageLike | null = getBrowserStorage(),
): TimingStats {
  const stats = loadTimingStats(storage);
  if (
    !storage || game.excludedFromHistory || !isContinuousMode(game.mode) || !game.completed ||
    stats.completedSessionIds.includes(game.sessionId)
  ) return stats;
  const next = {
    completedSessionIds: [...stats.completedSessionIds, game.sessionId].slice(-1000),
    winDurationsMs: game.won === true
      ? [...stats.winDurationsMs, game.elapsedMs].slice(-1000)
      : stats.winDurationsMs,
    winAttempts: game.won === true
      ? [...stats.winAttempts, game.attempts].slice(-1000)
      : stats.winAttempts,
  };
  storage.setItem(TIMING_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadLocalGame(
  mode: LocalGameMode,
  catalog = loadLocalCatalog(),
  storage: LocalStorageLike | null = getBrowserStorage(),
): LocalGame | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(GAME_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = parseStoredGameData(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const games = parsed as Record<string, unknown>;
    if (games.schemaVersion !== 2) {
      if (!games.custom && games.unlimited && typeof games.unlimited === "object") {
        games.custom = { ...(games.unlimited as LocalGame), mode: "custom" };
        delete games.unlimited;
      }
      games.schemaVersion = 2;
      storage.setItem(GAME_STORAGE_KEY, obfuscateGameData(games));
    }
    const saved = games[mode];
    return normalizeStoredGame(saved, mode, catalog);
  } catch {
    return null;
  }
}

export function loadActiveGameSessionIds(
  storage: LocalStorageLike | null = getBrowserStorage(),
): Set<string> {
  const sessionIds = new Set<string>();
  if (!storage) return sessionIds;
  try {
    const stored = storage.getItem(GAME_STORAGE_KEY);
    if (!stored) return sessionIds;
    const parsed: unknown = parseStoredGameData(stored);
    if (!parsed || typeof parsed !== "object") return sessionIds;
    const games = parsed as Record<string, unknown>;
    for (const mode of ["daily", "unlimited", "custom"] satisfies LocalGameMode[]) {
      const game = games[mode];
      if (game && typeof game === "object" && typeof (game as Partial<LocalGame>).sessionId === "string") {
        sessionIds.add((game as Partial<LocalGame>).sessionId!);
      }
    }
  } catch {
    // An unreadable save cannot identify any resumable sessions.
  }
  return sessionIds;
}

export function discardLocalGame(
  game: LocalGame,
  storage: LocalStorageLike | null = getBrowserStorage(),
) {
  if (!storage || game.completed) return;
  try {
    const current = storage.getItem(GAME_STORAGE_KEY);
    if (!current) return;
    const parsed: unknown = parseStoredGameData(current);
    if (!parsed || typeof parsed !== "object") return;
    const saved = parsed as Record<string, unknown>;
    const storedGame = saved[game.mode];
    if (
      !storedGame || typeof storedGame !== "object" ||
      (storedGame as Partial<LocalGame>).sessionId !== game.sessionId
    ) return;
    delete saved[game.mode];
    if (Object.keys(saved).length) storage.setItem(GAME_STORAGE_KEY, obfuscateGameData(saved));
    else storage.removeItem(GAME_STORAGE_KEY);
  } catch {
    // An unreadable save should not block leaving the page.
  }
}

function isGameRecord(value: unknown): value is GameRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<GameRecord>;
  return record.schemaVersion === 1 && typeof record.sessionId === "string" &&
    isOptionalTime(record.createdAt) && isOptionalTime(record.startedAt) &&
    isOptionalTime(record.updatedAt) && isOptionalTime(record.completedAt) &&
    typeof record.dayKey === "string" && Number.isInteger(record.challengeNumber) &&
    (record.mode === "daily" || record.mode === "unlimited" || record.mode === "custom") && Number.isInteger(record.maxAttempts) &&
    (record.unlimitedRunId === null || typeof record.unlimitedRunId === "string") &&
    Number.isInteger(record.unlimitedRound) && Number.isInteger(record.answerCharacterId) &&
    typeof record.answerName === "string" && Array.isArray(record.candidateNames) &&
    record.candidateNames.every((name) => typeof name === "string") && Array.isArray(record.tags) &&
    Array.isArray(record.guesses) && record.guesses.length > 0 && record.guesses.every((guess) => (
      isStoredGuess(guess) && guess.guessedAt !== undefined && guess.elapsedMs !== undefined
    )) && typeof record.completed === "boolean" &&
    (record.won === null || typeof record.won === "boolean") &&
    typeof record.durationMs === "number" && Number.isFinite(record.durationMs) && record.durationMs >= 0;
}

export function loadGameRecords(
  storage: LocalStorageLike | null = getBrowserStorage(),
): GameRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(GAME_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = parseStoredGameData(raw) as { records?: unknown };
    return Array.isArray(parsed?.records) ? parsed.records.filter(isGameRecord) : [];
  } catch {
    return [];
  }
}

function toGameRecord(game: LocalGame, catalog: LocalCatalog): GameRecord {
  const firstGuess = game.guesses[0];
  const lastGuess = game.guesses.at(-1);
  return {
    schemaVersion: 1,
    sessionId: game.sessionId,
    createdAt: game.createdAt,
    startedAt: firstGuess?.guessedAt ?? null,
    updatedAt: lastGuess?.guessedAt ?? game.createdAt,
    completedAt: game.completed ? (lastGuess?.guessedAt ?? null) : null,
    dayKey: game.dayKey,
    challengeNumber: game.challengeNumber,
    mode: game.mode,
    maxAttempts: game.maxAttempts,
    unlimitedRunId: game.unlimitedRunId,
    unlimitedRound: game.unlimitedRound,
    answerCharacterId: game.answerCharacterId,
    answerName: getLocalAnswerName(catalog, game),
    candidateNames: [...game.names],
    tags: game.tags.map((tag) => ({ ...tag })),
    guesses: game.guesses.map((guess) => ({
      ...guess,
      feedback: guess.feedback.map((item) => ({ ...item })),
    })),
    completed: game.completed,
    won: game.won,
    durationMs: lastGuess?.elapsedMs ?? game.elapsedMs,
  };
}

function saveGameRecord(game: LocalGame, catalog: LocalCatalog, storage: LocalStorageLike) {
  const records = loadGameRecords(storage);
  const record = toGameRecord(game, catalog);
  const existingIndex = records.findIndex((item) => item.sessionId === game.sessionId);
  if (existingIndex >= 0) records[existingIndex] = record;
  else records.push(record);
  storage.setItem(GAME_RECORDS_STORAGE_KEY, obfuscateGameData({ schemaVersion: 1, records }));
}

export function saveLocalGame(
  game: LocalGame,
  storage: LocalStorageLike | null = getBrowserStorage(),
  catalog: LocalCatalog = loadLocalCatalog(storage),
) {
  if (!storage) return;
  let saved: Record<string, unknown> = {};
  try {
    const current = storage.getItem(GAME_STORAGE_KEY);
    if (current) {
      const parsed: unknown = parseStoredGameData(current);
      if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
    }
  } catch {
    saved = {};
  }
  if (saved.schemaVersion !== 2) {
    if (!saved.custom && saved.unlimited && typeof saved.unlimited === "object") {
      saved.custom = { ...(saved.unlimited as LocalGame), mode: "custom" };
      delete saved.unlimited;
    }
    saved.schemaVersion = 2;
  }
  saved[game.mode] = game;
  storage.setItem(GAME_STORAGE_KEY, obfuscateGameData(saved));
  if (!game.excludedFromHistory && game.guesses.length > 0) {
    saveGameRecord(game, catalog, storage);
  }
}

function findCharacter(catalog: LocalCatalog, name: string): LocalCharacter | null {
  const targetName = normalizeName(name);
  return getActiveCharacters(catalog).find((character) =>
    [character.name, ...character.aliases].some((candidate) => normalizeName(candidate) === targetName),
  ) ?? null;
}

export function createSpecifiedLocalGame(
  catalog: LocalCatalog,
  name: string,
  now = Date.now(),
): LocalGame {
  const answer = findCharacter(catalog, name);
  if (!answer) throw new Error("题库中没有这位角色，请输入完整角色名或别名。");
  return createLocalGameWithAnswer(catalog, "custom", now, answer, true);
}

function valuesFor(catalog: LocalCatalog, characterId: number): CharacterValue[] {
  return catalog.values
    .filter((item) => item.characterId === characterId)
    .map((item) => ({ tagId: item.tagId, value: item.value, category: item.category, entries: item.entries }));
}

export function getLocalAnswerName(catalog: LocalCatalog, game: LocalGame): string {
  return catalog.characters.find((character) => character.id === game.answerCharacterId)?.name ?? "未知角色";
}

export function submitLocalGuess(
  catalog: LocalCatalog,
  game: LocalGame,
  name: string,
  now = Date.now(),
): LocalGuessResult {
  if (game.completed) return { ok: false, error: "本局已经结束，请开始下一局。" };
  const guessedCharacter = findCharacter(catalog, name);
  if (!guessedCharacter) return { ok: false, error: "题库中没有这位角色，请从候选列表中选择。" };

  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId);
  if (!answer || !answer.active) return { ok: false, error: "答案角色已被移除，请重新开始。" };

  const won = guessedCharacter.id === answer.id;
  const attempts = game.attempts + 1;
  const lost = attempts >= game.maxAttempts && !won;
  const startsTimer = game.guesses.length === 0 && game.timerStartedAt === null;
  const activeTimerStartedAt = startsTimer ? now : game.timerStartedAt;
  const elapsedMs = won || lost
    ? Math.max(0, game.elapsedMs + (activeTimerStartedAt === null ? 0 : now - activeTimerStartedAt))
    : game.elapsedMs;
  const guessElapsedMs = Math.max(
    0,
    game.elapsedMs + (activeTimerStartedAt === null ? 0 : now - activeTimerStartedAt),
  );
  const guess: LocalGuess = {
    id: guessedCharacter.id,
    name: guessedCharacter.name,
    guessedAt: now,
    elapsedMs: guessElapsedMs,
    feedback: compareGuess(game.tags, valuesFor(catalog, guessedCharacter.id), valuesFor(catalog, answer.id)),
  };
  const nextGame: LocalGame = {
    ...game,
    attempts,
    completed: won || lost,
    won: won || lost ? won : null,
    timerStartedAt: won || lost ? null : activeTimerStartedAt,
    elapsedMs,
    guesses: [...game.guesses, guess],
  };

  return {
    ok: true,
    game: nextGame,
    guess,
    message: won
      ? `正解！${answer.name} 现身了！`
      : lost
        ? `机会用完了，答案是 ${answer.name}。`
        : `还有 ${game.maxAttempts - attempts} 次机会。`,
    answer: won || lost ? answer.name : null,
  };
}
