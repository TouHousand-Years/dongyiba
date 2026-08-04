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
  guesses: LocalGuess[];
};

export type LocalGuessResult =
  | { ok: true; game: LocalGame; guess: LocalGuess; message: string; answer: string | null }
  | { ok: false; error: string };

const GAME_STORAGE_KEY = "dongyiba:games:v1";

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
    completed: stored.completed === true || attempts >= 8,
    guesses,
  };
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
): LocalGuessResult {
  if (game.completed) return { ok: false, error: "本局已经结束，请开始下一局。" };
  const guessedCharacter = findCharacter(catalog, name);
  if (!guessedCharacter) return { ok: false, error: "题库中没有这位角色，请从候选列表中选择。" };

  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId);
  if (!answer || !answer.active) return { ok: false, error: "答案角色已被移除，请重新开始。" };

  const won = guessedCharacter.id === answer.id;
  const attempts = game.attempts + 1;
  const lost = attempts >= game.maxAttempts && !won;
  const guess: LocalGuess = {
    id: guessedCharacter.id,
    name: guessedCharacter.name,
    feedback: compareGuess(game.tags, valuesFor(catalog, guessedCharacter.id), valuesFor(catalog, answer.id)),
  };
  const nextGame: LocalGame = {
    ...game,
    attempts,
    completed: won || lost,
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
