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

export type LocalGameMode = "daily" | "ten" | "unlimited" | "custom";
export type TenMatchDifficulty = "easy" | "normal" | "hard" | "lunatic";

export const TEN_MATCH_ROUNDS = 10;
export const TEN_MATCH_INITIAL_MS = 10 * 60 * 1000;
export const TEN_MATCH_RULES: Record<TenMatchDifficulty, { wrongPenaltiesMs: number[]; correctBonusMs: number }> = {
  easy: { wrongPenaltiesMs: [1, 1, 2, 3, 4, 5, 6].map((seconds) => seconds * 1000), correctBonusMs: 50_000 },
  normal: { wrongPenaltiesMs: [1, 2, 3, 5, 7, 9, 11].map((seconds) => seconds * 1000), correctBonusMs: 40_000 },
  hard: { wrongPenaltiesMs: [1, 2, 4, 8, 16, 16, 16].map((seconds) => seconds * 1000), correctBonusMs: 30_000 },
  lunatic: { wrongPenaltiesMs: [1, 2, 4, 8, 16, 32, 64].map((seconds) => seconds * 1000), correctBonusMs: 20_000 },
};

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

export type TenMatchRound = {
  round: number;
  answerCharacterId: number;
  answer: string;
  guesses: LocalGuess[];
  won: boolean;
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
  tenMatchRound: number;
  tenMatchDifficulty: TenMatchDifficulty;
  tenMatchAdjustmentMs: number;
  tenMatchHistory: TenMatchRound[];
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
  tenMatchRounds?: TenMatchRound[];
  tenMatchRemainingMs?: number;
  tenMatchDifficulty?: TenMatchDifficulty;
};

export type TimingStats = {
  completedSessionIds: string[];
  winDurationsMs: number[];
  winAttempts: number[];
};

export type LocalGuessResult =
  | {
    ok: true;
    game: LocalGame;
    guess: LocalGuess;
    message: string;
    answer: string | null;
    roundCompleted: boolean;
    timeDeltaMs: number;
  }
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

export function createLocalGame(
  catalog: LocalCatalog,
  mode: LocalGameMode,
  now = Date.now(),
  tenMatchDifficulty: TenMatchDifficulty = "hard",
): LocalGame {
  return createLocalGameWithAnswer(catalog, mode, now, null, false, tenMatchDifficulty);
}

function isTenMatchDifficulty(value: unknown): value is TenMatchDifficulty {
  return value === "easy" || value === "normal" || value === "hard" || value === "lunatic";
}

function easyTenMatchCharacters(catalog: LocalCatalog, characters: LocalCharacter[]): LocalCharacter[] {
  const playerTag = catalog.tags.find((tag) => tag.name.startsWith("自机次数"));
  const coverTag = catalog.tags.find((tag) => tag.name.startsWith("封面人物次数"));
  if (!playerTag || !coverTag) return characters;
  return characters.filter((character) => {
    const playerCount = Number(catalog.values.find((value) => (
      value.characterId === character.id && value.tagId === playerTag.id
    ))?.value ?? 0);
    const coverCount = Number(catalog.values.find((value) => (
      value.characterId === character.id && value.tagId === coverTag.id
    ))?.value ?? 0);
    return playerCount > 0 || coverCount > 0;
  });
}

function createLocalGameWithAnswer(
  catalog: LocalCatalog,
  mode: LocalGameMode,
  now: number,
  specifiedAnswer: LocalCharacter | null,
  excludedFromHistory: boolean,
  tenMatchDifficulty: TenMatchDifficulty = "hard",
): LocalGame {
  const characters = getActiveCharacters(catalog);
  const tags = getActiveTags(catalog);
  if (!characters.length || !tags.length) throw new Error("题库尚未配置完成。");
  const answerCharacters = mode === "ten" && tenMatchDifficulty === "easy"
    ? easyTenMatchCharacters(catalog, characters)
    : characters;
  if (!answerCharacters.length) throw new Error("Easy 难度没有可用的答案角色。");

  const day = shanghaiDay();
  const index = mode === "daily"
    ? dayHash(day) % answerCharacters.length
    : Math.floor(Math.random() * answerCharacters.length);

  return {
    sessionId: newSessionId(),
    createdAt: now,
    dayKey: day,
    challengeNumber: challengeNumber(day),
    mode,
    excludedFromHistory,
    maxAttempts: 8,
    answerCharacterId: specifiedAnswer?.id ?? answerCharacters[index].id,
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
    tenMatchRound: 1,
    tenMatchDifficulty,
    tenMatchAdjustmentMs: 0,
    tenMatchHistory: [],
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

function isStoredTenMatchRound(value: unknown): value is TenMatchRound {
  if (!value || typeof value !== "object") return false;
  const round = value as Partial<TenMatchRound>;
  return Number.isInteger(round.round) && Number(round.round) >= 1 && Number(round.round) <= TEN_MATCH_ROUNDS &&
    Number.isInteger(round.answerCharacterId) && typeof round.answer === "string" &&
    Array.isArray(round.guesses) && round.guesses.length > 0 && round.guesses.length <= 8 &&
    round.guesses.every(isStoredGuess) && typeof round.won === "boolean";
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
  const tenMatchRound = mode === "ten" && Number.isInteger(stored.tenMatchRound)
    ? Math.min(TEN_MATCH_ROUNDS, Math.max(1, Number(stored.tenMatchRound)))
    : 1;
  const tenMatchDifficulty = mode === "ten" && isTenMatchDifficulty(stored.tenMatchDifficulty)
    ? stored.tenMatchDifficulty
    : "hard";
  const tenMatchAdjustmentMs = mode === "ten" && typeof stored.tenMatchAdjustmentMs === "number" && Number.isFinite(stored.tenMatchAdjustmentMs)
    ? stored.tenMatchAdjustmentMs
    : 0;
  const tenMatchHistory = mode === "ten" && Array.isArray(stored.tenMatchHistory)
    ? stored.tenMatchHistory.filter(isStoredTenMatchRound).map((round) => ({
      ...round,
      guesses: round.guesses.map((guess) => ({
        ...guess,
        guessedAt: guess.guessedAt ?? null,
        elapsedMs: guess.elapsedMs ?? null,
      })),
    }))
    : [];
  const storedElapsedMs = typeof stored.elapsedMs === "number" && Number.isFinite(stored.elapsedMs) && stored.elapsedMs >= 0
    ? stored.elapsedMs
    : 0;
  const storedTimerStartedAt = typeof stored.timerStartedAt === "number" && Number.isFinite(stored.timerStartedAt)
    ? stored.timerStartedAt
    : guesses.length > 0 ? Date.now() : null;
  const expired = mode === "ten" && stored.completed !== true && storedTimerStartedAt !== null &&
    TEN_MATCH_INITIAL_MS + tenMatchAdjustmentMs - (storedElapsedMs + Date.now() - storedTimerStartedAt) <= 0;
  const roundCompleted = guesses.some((guess) => guess.id === answerCharacterId) || attempts >= 8;
  const completed = mode === "ten"
    ? stored.completed === true || expired || (tenMatchRound === TEN_MATCH_ROUNDS && roundCompleted)
    : stored.completed === true || attempts >= 8;
  const elapsedMs = expired && storedTimerStartedAt !== null
    ? Math.max(0, storedElapsedMs + Date.now() - storedTimerStartedAt)
    : storedElapsedMs;
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
      ? (expired ? false : typeof stored.won === "boolean" ? stored.won : guesses.some((guess) => guess.id === answerCharacterId))
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
    tenMatchRound,
    tenMatchDifficulty,
    tenMatchAdjustmentMs,
    tenMatchHistory,
    guesses,
  };
}

export function getElapsedMs(game: LocalGame, now = Date.now()): number {
  return Math.max(0, game.elapsedMs + (game.timerStartedAt === null ? 0 : now - game.timerStartedAt));
}

export function getTenMatchRemainingMs(game: LocalGame, now = Date.now()): number {
  if (game.mode !== "ten") return 0;
  return Math.max(0, TEN_MATCH_INITIAL_MS + game.tenMatchAdjustmentMs - getElapsedMs(game, now));
}

export function isTenMatchRoundComplete(game: LocalGame): boolean {
  return game.mode === "ten" && (
    game.guesses.some((guess) => guess.id === game.answerCharacterId) || game.attempts >= game.maxAttempts
  );
}

function cloneGuess(guess: LocalGuess): LocalGuess {
  return { ...guess, feedback: guess.feedback.map((item) => ({ ...item })) };
}

function toTenMatchRound(catalog: LocalCatalog, game: LocalGame): TenMatchRound {
  return {
    round: game.tenMatchRound,
    answerCharacterId: game.answerCharacterId,
    answer: getLocalAnswerName(catalog, game),
    guesses: game.guesses.map(cloneGuess),
    won: game.guesses.some((guess) => guess.id === game.answerCharacterId),
  };
}

export type TenMatchAdvanceResult = {
  game: LocalGame;
  timeDeltaMs: number;
  advancedRounds: number;
};

export function createNextTenMatchGame(
  catalog: LocalCatalog,
  previous: LocalGame,
  now = Date.now(),
): TenMatchAdvanceResult {
  if (previous.mode !== "ten" || previous.completed || !isTenMatchRoundComplete(previous)) {
    throw new Error("只有十番战中已结束的非末轮可以自动进入下一轮。");
  }

  let current = previous;
  let timeDeltaMs = 0;
  let advancedRounds = 0;
  while (!current.completed && current.tenMatchRound < TEN_MATCH_ROUNDS && isTenMatchRoundComplete(current)) {
    const carriedGuess = getLocalAnswerName(catalog, current);
    const nextBase = createLocalGame(catalog, "ten", now, current.tenMatchDifficulty);
    const next: LocalGame = {
      ...nextBase,
      sessionId: current.sessionId,
      createdAt: current.createdAt,
      timerStartedAt: current.timerStartedAt,
      elapsedMs: current.elapsedMs,
      tenMatchRound: current.tenMatchRound + 1,
      tenMatchAdjustmentMs: current.tenMatchAdjustmentMs,
      tenMatchHistory: [...current.tenMatchHistory, toTenMatchRound(catalog, current)],
    };
    const carried = submitLocalGuess(catalog, next, carriedGuess, now);
    if (!carried.ok) throw new Error(carried.error);
    current = carried.game;
    timeDeltaMs += carried.timeDeltaMs;
    advancedRounds += 1;
  }
  return { game: current, timeDeltaMs, advancedRounds };
}

export function expireTenMatchGame(game: LocalGame, now = Date.now()): LocalGame {
  if (game.mode !== "ten" || game.completed) return game;
  return {
    ...game,
    completed: true,
    won: false,
    timerStartedAt: null,
    elapsedMs: getElapsedMs(game, now),
  };
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
    for (const mode of ["daily", "ten", "unlimited", "custom"] satisfies LocalGameMode[]) {
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
    (record.mode === "daily" || record.mode === "ten" || record.mode === "unlimited" || record.mode === "custom") && Number.isInteger(record.maxAttempts) &&
    (record.unlimitedRunId === null || typeof record.unlimitedRunId === "string") &&
    Number.isInteger(record.unlimitedRound) && Number.isInteger(record.answerCharacterId) &&
    typeof record.answerName === "string" && Array.isArray(record.candidateNames) &&
    record.candidateNames.every((name) => typeof name === "string") && Array.isArray(record.tags) &&
    Array.isArray(record.guesses) && record.guesses.length > 0 && record.guesses.every((guess) => (
      isStoredGuess(guess) && guess.guessedAt !== undefined && guess.elapsedMs !== undefined
    )) && typeof record.completed === "boolean" &&
    (record.won === null || typeof record.won === "boolean") &&
    typeof record.durationMs === "number" && Number.isFinite(record.durationMs) && record.durationMs >= 0 &&
    (record.tenMatchRounds === undefined || (
      Array.isArray(record.tenMatchRounds) && record.tenMatchRounds.every(isStoredTenMatchRound)
    )) && (record.tenMatchRemainingMs === undefined || (
      typeof record.tenMatchRemainingMs === "number" && Number.isFinite(record.tenMatchRemainingMs) && record.tenMatchRemainingMs >= 0
    )) && (record.tenMatchDifficulty === undefined || isTenMatchDifficulty(record.tenMatchDifficulty));
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
  const tenMatchRounds = game.mode === "ten"
    ? [
      ...game.tenMatchHistory,
      ...(game.guesses.length ? [toTenMatchRound(catalog, game)] : []),
    ]
    : undefined;
  const recordGuesses = tenMatchRounds?.flatMap((round) => round.guesses) ?? game.guesses;
  const firstGuess = recordGuesses[0];
  const lastGuess = recordGuesses.at(-1);
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
    guesses: recordGuesses.map(cloneGuess),
    completed: game.completed,
    won: game.won,
    durationMs: lastGuess?.elapsedMs ?? game.elapsedMs,
    tenMatchRounds,
    tenMatchRemainingMs: game.mode === "ten" ? getTenMatchRemainingMs(game) : undefined,
    tenMatchDifficulty: game.mode === "ten" ? game.tenMatchDifficulty : undefined,
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
  if (game.mode === "ten" && game.timerStartedAt !== null && getTenMatchRemainingMs(game, now) <= 0) {
    return { ok: false, error: "十番战时间已到。" };
  }
  const guessedCharacter = findCharacter(catalog, name);
  if (!guessedCharacter) return { ok: false, error: "题库中没有这位角色，请从候选列表中选择。" };

  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId);
  if (!answer || !answer.active) return { ok: false, error: "答案角色已被移除，请重新开始。" };

  const won = guessedCharacter.id === answer.id;
  const attempts = game.attempts + 1;
  const lost = attempts >= game.maxAttempts && !won;
  const startsTimer = game.guesses.length === 0 && game.timerStartedAt === null;
  const activeTimerStartedAt = startsTimer ? now : game.timerStartedAt;
  const tenMatchRules = TEN_MATCH_RULES[game.tenMatchDifficulty];
  const timeDeltaMs = game.mode === "ten"
    ? won
      ? tenMatchRules.correctBonusMs
      : attempts <= 1
        ? 0
        : -tenMatchRules.wrongPenaltiesMs[Math.min(attempts - 2, tenMatchRules.wrongPenaltiesMs.length - 1)]
    : 0;
  const tenMatchAdjustmentMs = game.tenMatchAdjustmentMs + timeDeltaMs;
  const guessElapsedMs = Math.max(
    0,
    game.elapsedMs + (activeTimerStartedAt === null ? 0 : now - activeTimerStartedAt),
  );
  const timedOut = game.mode === "ten" && TEN_MATCH_INITIAL_MS + tenMatchAdjustmentMs - guessElapsedMs <= 0;
  const roundCompleted = won || lost;
  const completed = game.mode === "ten"
    ? timedOut || (game.tenMatchRound === TEN_MATCH_ROUNDS && roundCompleted)
    : roundCompleted;
  const allTenWon = game.mode === "ten" && game.tenMatchHistory.every((round) => round.won) && won;
  const elapsedMs = completed
    ? Math.max(0, game.elapsedMs + (activeTimerStartedAt === null ? 0 : now - activeTimerStartedAt))
    : game.elapsedMs;
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
    completed,
    won: completed ? (game.mode === "ten" ? !timedOut && allTenWon : won) : null,
    timerStartedAt: completed ? null : activeTimerStartedAt,
    elapsedMs,
    tenMatchAdjustmentMs,
    guesses: [...game.guesses, guess],
  };

  return {
    ok: true,
    game: nextGame,
    guess,
    message: timedOut
      ? `时间到，十番战结束。当前答案是 ${answer.name}。`
      : won
        ? `正解！${answer.name} 现身了！`
        : lost
          ? `机会用完了，答案是 ${answer.name}。`
          : `还有 ${game.maxAttempts - attempts} 次机会。`,
    answer: completed ? answer.name : game.mode === "ten" ? null : roundCompleted ? answer.name : null,
    roundCompleted,
    timeDeltaMs,
  };
}
