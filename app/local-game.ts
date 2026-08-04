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
  loadLocalCatalog,
  toTagDefinitions,
  type LocalCatalog,
  type LocalCharacter,
  type LocalStorageLike,
} from "./local-catalog";

export type LocalGameMode = "daily" | "unlimited";

export type LocalGuess = {
  id: number;
  name: string;
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
  dayKey: string;
  challengeNumber: number;
  mode: LocalGameMode;
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

export type TimingStats = {
  completedSessionIds: string[];
  winDurationsMs: number[];
  winAttempts: number[];
};

export type LocalGuessResult =
  | { ok: true; game: LocalGame; guess: LocalGuess; message: string; answer: string | null }
  | { ok: false; error: string };

const GAME_STORAGE_KEY = "dongyiba:games:v1";
const TIMING_STORAGE_KEY = "dongyiba:timing:v1";

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

export function createLocalGame(catalog: LocalCatalog, mode: LocalGameMode): LocalGame {
  const characters = getActiveCharacters(catalog);
  const tags = getActiveTags(catalog);
  if (!characters.length || !tags.length) throw new Error("题库尚未配置完成。");

  const day = shanghaiDay();
  const index = mode === "daily"
    ? dayHash(day) % characters.length
    : Math.floor(Math.random() * characters.length);

  return {
    sessionId: newSessionId(),
    dayKey: day,
    challengeNumber: challengeNumber(day),
    mode,
    maxAttempts: 8,
    answerCharacterId: characters[index].id,
    names: characters.map((character) => character.name),
    tags: toTagDefinitions(tags),
    attempts: 0,
    completed: false,
    won: null,
    timerStartedAt: null,
    elapsedMs: 0,
    unlimitedRunId: mode === "unlimited" ? newSessionId() : null,
    unlimitedRound: 1,
    unlimitedElapsedMs: 0,
    unlimitedHistory: [],
    guesses: [],
  };
}

function isStoredGuess(value: unknown): value is LocalGuess {
  if (!value || typeof value !== "object") return false;
  const guess = value as Partial<LocalGuess>;
  return Number.isInteger(guess.id) && typeof guess.name === "string" && Array.isArray(guess.feedback);
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

  const guesses = stored.guesses as LocalGuess[];
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
    dayKey: stored.dayKey,
    challengeNumber: challengeNumber(stored.dayKey),
    mode,
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
    unlimitedRunId: mode === "unlimited"
      ? (typeof stored.unlimitedRunId === "string" ? stored.unlimitedRunId : stored.sessionId)
      : null,
    unlimitedRound: mode === "unlimited" && Number.isInteger(stored.unlimitedRound)
      ? Math.max(1, Number(stored.unlimitedRound))
      : 1,
    unlimitedElapsedMs: mode === "unlimited" && typeof stored.unlimitedElapsedMs === "number" && Number.isFinite(stored.unlimitedElapsedMs)
      ? Math.max(0, stored.unlimitedElapsedMs)
      : 0,
    unlimitedHistory,
    guesses,
  };
}

export function getElapsedMs(game: LocalGame, now = Date.now()): number {
  return Math.max(0, game.elapsedMs + (game.timerStartedAt === null ? 0 : now - game.timerStartedAt));
}

export function createNextUnlimitedGame(catalog: LocalCatalog, previous: LocalGame): LocalGame {
  if (previous.mode !== "unlimited" || !previous.completed) {
    throw new Error("只有已结束的无限模式对局可以进入下一轮。");
  }
  const next = createLocalGame(catalog, "unlimited");
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
    !storage || game.mode !== "unlimited" || !game.completed ||
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
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const saved = (parsed as Record<string, unknown>)[mode];
    return normalizeStoredGame(saved, mode, catalog);
  } catch {
    return null;
  }
}

export function saveLocalGame(
  game: LocalGame,
  storage: LocalStorageLike | null = getBrowserStorage(),
) {
  if (!storage) return;
  let saved: Record<string, unknown> = {};
  try {
    const current = storage.getItem(GAME_STORAGE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
    }
  } catch {
    saved = {};
  }
  saved[game.mode] = game;
  storage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved));
}

function findCharacter(catalog: LocalCatalog, name: string): LocalCharacter | null {
  const targetName = normalizeName(name);
  return getActiveCharacters(catalog).find((character) =>
    [character.name, ...character.aliases].some((candidate) => normalizeName(candidate) === targetName),
  ) ?? null;
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
  const guess: LocalGuess = {
    id: guessedCharacter.id,
    name: guessedCharacter.name,
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
