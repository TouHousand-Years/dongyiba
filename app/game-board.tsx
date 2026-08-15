"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createNextUnlimitedGame,
  createLocalGame,
  createSpecifiedLocalGame,
  discardLocalGame,
  getElapsedMs,
  getLocalAnswerName,
  loadActiveGameSessionIds,
  loadGameCatalog,
  loadGameRecords,
  loadLocalGame,
  loadTimingStats,
  recordCompletedTiming,
  saveLocalGame,
  submitLocalGuess,
  type LocalGame,
  type LocalGameMode,
  type GameRecord,
  type TimingStats,
} from "./local-game";
import {
  loadCatalogLibrary,
  selectPlayCatalog,
  type CatalogRecord,
} from "./local-catalog";

type PageTheme = "dong" | "flandre";

const THEME_STORAGE_KEY = "dongyiba:theme:v1";
const CONTINUOUS_MODES: LocalGameMode[] = ["unlimited", "custom"];

function isContinuousMode(mode: LocalGameMode) {
  return CONTINUOUS_MODES.includes(mode);
}

export function GameBoard() {
  const [game, setGame] = useState<LocalGame | null>(null);
  const [mode, setMode] = useState<LocalGameMode>("daily");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("正在读取题库……");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [activeGameSessionIds, setActiveGameSessionIds] = useState<Set<string>>(() => new Set());
  const [pageTheme, setPageTheme] = useState<PageTheme>("dong");
  const [catalogChoices, setCatalogChoices] = useState<CatalogRecord[]>([]);
  const [playCatalogId, setPlayCatalogId] = useState("");
  const [showCatalogMenu, setShowCatalogMenu] = useState(false);
  const [specifiedCharacterInput, setSpecifiedCharacterInput] = useState("");
  const catalogPickerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<LocalGame | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [timingStats, setTimingStats] = useState<TimingStats>({
    completedSessionIds: [],
    winDurationsMs: [],
    winAttempts: [],
  });

  function start(nextMode: LocalGameMode = mode, forceNew = false, specifiedCharacterName = "") {
    setBusy(true);
    try {
      const catalog = loadGameCatalog(nextMode);
      const restored = forceNew ? null : loadLocalGame(nextMode, catalog);
      const nextGame = restored ?? (specifiedCharacterName
        ? createSpecifiedLocalGame(catalog, specifiedCharacterName)
        : createLocalGame(catalog, nextMode));
      saveLocalGame(nextGame, undefined, catalog);
      setTimingStats(nextGame.completed ? recordCompletedTiming(nextGame) : loadTimingStats());
      setGame(nextGame);
      setNow(Date.now());
      setQuery("");
      setSpecifiedCharacterInput(nextGame.excludedFromHistory ? "已指定人物" : "");
      setAnswer(nextGame.completed ? getLocalAnswerName(catalog, nextGame) : "");
      setMessage(
        nextGame.completed
          ? `本局已结束，答案是 ${getLocalAnswerName(catalog, nextGame)}。`
          : nextMode === "daily"
            ? "输入角色名，开始今天这一把。"
            : "新角色已藏好。",
      );
    } catch (error) {
      setMessage(
        specifiedCharacterName && error instanceof Error
          ? error.message
          : "题库尚未配置完成，请打开标签后台检查。",
      );
    } finally {
      setBusy(false);
    }
  }

  function initialize() {
    const library = loadCatalogLibrary();
    setCatalogChoices(library.catalogs);
    setPlayCatalogId(library.playCatalogId);
    start("daily");
  }

  useEffect(() => {
    // Initial data loading intentionally hydrates this client-only game board.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "flandre") {
      // Theme preference is intentionally restored after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageTheme("flandre");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = pageTheme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [pageTheme]);

  useEffect(() => {
    document.title = pageTheme === "flandre"
      ? "芙一把｜猜东方 Project 角色"
      : "东一把｜猜东方 Project 角色";
  }, [pageTheme]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!game || game.timerStartedAt === null || game.completed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [game]);

  useEffect(() => {
    let discardedDailyGame = false;
    const exitDailyGame = () => {
      const currentGame = gameRef.current;
      if (!currentGame || currentGame.mode !== "daily" || currentGame.completed) return;
      discardLocalGame(currentGame);
      gameRef.current = null;
      discardedDailyGame = true;
    };
    const restartAfterBackForwardCache = (event: PageTransitionEvent) => {
      if (!event.persisted || !discardedDailyGame) return;
      discardedDailyGame = false;
      initialize();
    };
    window.addEventListener("pagehide", exitDailyGame);
    window.addEventListener("pageshow", restartAfterBackForwardCache);
    return () => {
      window.removeEventListener("pagehide", exitDailyGame);
      window.removeEventListener("pageshow", restartAfterBackForwardCache);
      exitDailyGame();
    };
    // The exit lifecycle intentionally stays bound for this board instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showCatalogMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!catalogPickerRef.current?.contains(event.target as Node)) setShowCatalogMenu(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [showCatalogMenu]);

  const selectedCatalog = catalogChoices.find((catalog) => catalog.id === playCatalogId);

  const suggestions = useMemo(() => {
    if (!game || query.trim().length < 1) return [];
    return game.names
      .filter((name) => name.includes(query.trim()) && !game.guesses.some((guess) => guess.name === name))
      .slice(0, 6);
  }, [game, query]);

  const specifiedSuggestions = useMemo(() => {
    const input = specifiedCharacterInput.trim();
    if (!selectedCatalog || input.length < 1 || input === "已指定人物") return [];
    return selectedCatalog.catalog.characters
      .filter((character) => character.active && character.name.includes(input))
      .slice(0, 6)
      .map((character) => character.name);
  }, [selectedCatalog, specifiedCharacterInput]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!game || !query.trim() || answer || busy) return;
    setBusy(true);
    try {
      const catalog = loadGameCatalog(game.mode);
      const result = submitLocalGuess(catalog, game, query, Date.now());
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setGame(result.game);
      saveLocalGame(result.game, undefined, catalog);
      if (result.game.completed) setTimingStats(recordCompletedTiming(result.game));
      setNow(Date.now());
      setQuery("");
      setMessage(result.message);
      if (result.answer) setAnswer(result.answer);
    } catch {
      setMessage("这次猜测未能完成，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const guesses = game?.guesses ?? [];
  const attemptsLeft = Math.max(0, (game?.maxAttempts ?? 8) - guesses.length);
  const elapsedMs = game ? getElapsedMs(game, now) : 0;
  const totalElapsedMs = game ? game.unlimitedElapsedMs + elapsedMs : 0;
  const timerVisible = Boolean(game && !(game.completed && game.won === false));
  const recentDurations = timingStats.winDurationsMs.slice(-10);
  const recentAttempts = timingStats.winAttempts.slice(-10);
  const average = (durations: number[]) => durations.length
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : null;

  function nextUnlimitedRound() {
    if (!game || !isContinuousMode(game.mode) || !game.completed) return;
    setBusy(true);
    try {
      const catalog = loadGameCatalog(game.mode);
      const nextGame = createNextUnlimitedGame(catalog, game);
      saveLocalGame(nextGame, undefined, catalog);
      setGame(nextGame);
      setQuery("");
      setAnswer("");
      setNow(Date.now());
      setMessage("新角色已藏好。");
    } catch {
      setMessage("下一轮未能开始，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function togglePageTheme() {
    setPageTheme((currentTheme) => {
      const nextTheme = currentTheme === "dong" ? "flandre" : "dong";
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      return nextTheme;
    });
  }

  function changePlayCatalog(catalogId: string) {
    setShowCatalogMenu(false);
    if (catalogId === playCatalogId) return;
    selectPlayCatalog(catalogId);
    setPlayCatalogId(catalogId);
    start("custom", true);
  }

  function specifyCharacter(event: FormEvent) {
    event.preventDefault();
    const name = specifiedCharacterInput.trim();
    if (!name || name === "已指定人物" || busy) return;
    start("custom", true, name);
  }

  function openHistory() {
    setShowHelp(false);
    setActiveGameSessionIds(loadActiveGameSessionIds());
    setGameRecords([...loadGameRecords()].sort((left, right) => (
      (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0)
    )));
    setShowHistory(true);
  }

  const isFlandreTheme = pageTheme === "flandre";

  return (
    <main className={`game-shell theme-${pageTheme}`}>
      <div className="mist mist-one" />
      <div className="mist mist-two" />
      <header className="topbar">
        <p className="challenge">每日挑战 #{game?.challengeNumber ?? "—"}</p>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-pressed={isFlandreTheme}
            aria-label={isFlandreTheme ? "切换到东一把主题" : "切换到芙一把主题"}
            onClick={togglePageTheme}
          >
            <span className="theme-gem" aria-hidden="true" />
            {isFlandreTheme ? "东一把" : "芙一把"}
          </button>
          <a className="admin-link" href="admin/">标签后台</a>
          <button className="ghost-button" onClick={() => { setShowHistory(false); setShowHelp(true); }}>游戏玩法</button>
          <button className="ghost-button" onClick={openHistory}>游玩历史</button>
        </div>
      </header>

      <section className="hero">
        <div className="crystal-wings" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
        </div>
        <div className="crest" aria-hidden="true">{isFlandreTheme ? "芙" : "東"}</div>
        <p className="eyebrow">{isFlandreTheme ? "Scarlet character puzzle" : "Gensokyo character puzzle"}</p>
        <h1>{isFlandreTheme ? "芙一把" : "东一把"}</h1>
        <p className="subtitle">{isFlandreTheme ? "猜出隐藏的那位东方角色" : "猜出隐藏的那位东方角色"}</p>
      </section>

      <section className="status-strip" aria-label="今日挑战状态">
        <span><b>{game?.names.length ?? "—"}</b> 位角色</span>
        <span><b>{game?.maxAttempts ?? 8}</b> 次机会</span>
        <span><b>{attemptsLeft}</b> 次剩余</span>
      </section>

      {game && timerVisible && (
        <section className="timer-strip" aria-label="游戏计时" aria-live="off">
          {isContinuousMode(mode) && <span><small>总用时</small><b>{formatDuration(totalElapsedMs)}</b></span>}
          <span><small>{isContinuousMode(mode) ? "当前人物" : "本局用时"}</small><b>{formatDuration(elapsedMs)}</b></span>
        </section>
      )}

      <div className={`play-layout ${isContinuousMode(mode) ? "with-stats" : ""}`}>
      <section className="game-card" aria-label="东一把游戏挑战">
        {mode === "custom" && (
          <div className="custom-game-options">
            <div
              className="game-catalog-picker"
              ref={catalogPickerRef}
              onKeyDown={(event) => { if (event.key === "Escape") setShowCatalogMenu(false); }}
            >
              <span>游玩题库</span>
              <div className="catalog-dropdown">
                <button
                  className="catalog-dropdown-trigger"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={showCatalogMenu}
                  disabled={busy || catalogChoices.length === 0}
                  onClick={() => setShowCatalogMenu((visible) => !visible)}
                >
                  <span>{selectedCatalog?.official ? "官方 · " : ""}{selectedCatalog?.name ?? "选择题库"}</span>
                  <i aria-hidden="true" />
                </button>
                {showCatalogMenu && (
                  <div className="catalog-dropdown-menu" role="listbox" aria-label="游玩题库">
                    {catalogChoices.map((catalog) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={catalog.id === playCatalogId}
                        className={catalog.id === playCatalogId ? "selected" : ""}
                        key={catalog.id}
                        onClick={() => changePlayCatalog(catalog.id)}
                      >{catalog.official ? "官方 · " : ""}{catalog.name}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <form className="specified-character-picker" onSubmit={specifyCharacter}>
              <label htmlFor="specified-character">指定人物</label>
              <div className="specified-input-row">
                <div className="specified-autocomplete">
                  <input
                    id="specified-character"
                    value={specifiedCharacterInput}
                    onChange={(event) => setSpecifiedCharacterInput(event.target.value)}
                    placeholder="输入角色名"
                    autoComplete="off"
                    disabled={busy}
                  />
                  {specifiedSuggestions.length > 0 && (
                    <div className="suggestions specified-suggestions">
                      {specifiedSuggestions.map((name) => (
                        <button type="button" key={name} onClick={() => setSpecifiedCharacterInput(name)}>{name}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={!specifiedCharacterInput.trim() || specifiedCharacterInput === "已指定人物" || busy}>指定</button>
              </div>
            </form>
          </div>
        )}
        <div className="mode-switch" aria-label="选择游戏模式">
          {(["daily", "unlimited", "custom"] as const).map((item) => (
            <button
              key={item}
              className={mode === item ? "active" : ""}
              aria-pressed={mode === item}
              onClick={() => { setMode(item); start(item, true); }}
            >
              {item === "daily" ? "每日挑战" : item === "unlimited" ? "无限模式" : "自定义模式"}
            </button>
          ))}
        </div>

        <form className="guess-form" onSubmit={submit}>
          <label htmlFor="character-name">角色名</label>
          <div className="input-row">
            <div className="autocomplete">
              <input
                id="character-name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：博丽灵梦 / 魂魄妖梦"
                autoComplete="off"
                disabled={!game || Boolean(answer)}
              />
              {suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map((name) => (
                    <button type="button" key={name} onClick={() => setQuery(name)}>{name}</button>
                  ))}
                </div>
              )}
            </div>
            <button className="submit-button" disabled={!query.trim() || busy || Boolean(answer)}>
              {busy ? "判定中" : "猜"}
            </button>
          </div>
        </form>

        <p className="game-message" role="status">{message}</p>

        {guesses.length > 0 && game && (
          <div className="feedback-wrap">
            <table className="feedback-table">
              <thead>
                <tr>
                  <th>角色</th>
                  {game.tags.map((tag) => <th key={tag.id}>{tag.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...guesses].reverse().map((guess) => (
                  <tr key={`${guess.id}-${guess.name}`}>
                    <th>{guess.name}</th>
                    {game.tags.map((tag) => {
                      const cell = guess.feedback.find((item) => item.tagId === tag.id);
                      return (
                        <td key={tag.id} className={`result-${cell?.state ?? "miss"}`}>
                          {cell?.matchedCategories ? (
                            cell.matchedCategories.length || cell.matchedValues?.length ? (
                              <div className="feedback-values">
                                {cell.matchedCategories.map((matchedCategory) => (
                                  <span key={`category-${matchedCategory}`}><small>大类</small>{matchedCategory}</span>
                                ))}
                                {cell.matchedValues?.map((matchedValue) => (
                                  <span key={`value-${matchedValue}`}><small>小类</small>{matchedValue}</span>
                                ))}
                              </div>
                            ) : <span>无匹配</span>
                          ) : cell?.matches ? (
                            cell.matches.length ? (
                              <div className="feedback-values">
                                {cell.matches.map((entry, index) => (
                                  <span key={`${entry.category ?? ""}-${entry.value}-${index}`}>
                                    {entry.category && <small>{entry.category}</small>}
                                    {entry.value}
                                  </span>
                                ))}
                              </div>
                            ) : <span>无匹配</span>
                          ) : <>
                            {cell?.category && <small>{cell.category}</small>}
                            <span>{cell?.value ?? "未知"}</span>
                          </>}
                          {cell?.direction && <i>{cell.direction === "higher" ? "↑" : "↓"}</i>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {answer && (
          <button className="again-button" onClick={() => isContinuousMode(mode) ? nextUnlimitedRound() : start(mode, true)}>
            {mode === "daily" ? "再看一遍" : "下一位角色"}
          </button>
        )}

        <div className="legend">
          <span><i className="match" />命中</span>
          <span><i className="close" />接近</span>
          <span><i className="miss" />不符</span>
        </div>
      </section>

      {isContinuousMode(mode) && game && (
        <aside className="timing-panel" aria-label={`${mode === "custom" ? "自定义" : "无限"}模式用时统计`}>
          <p className="eyebrow">Run history</p>
          <h2>本次游戏</h2>
          {game.unlimitedHistory.length ? (
            <ol className="round-history">
              {[...game.unlimitedHistory].reverse().map((round) => (
                <li key={round.round}>
                  <span>第 {round.round} 轮 · {round.answer}</span>
                  <div className="round-metrics">
                    <b>{round.won ? formatDuration(round.durationMs) : "未猜出"}</b>
                    <b>{round.attempts} 次</b>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="empty-history">完成当前人物后，这里会记录前几轮用时。</p>}
          <dl className="averages">
            <div className="average-head"><dt /><dd><span>用时</span><span>计次</span></dd></div>
            <div>
              <dt>最近 10 次平均</dt>
              <dd><span>{formatAverage(average(recentDurations))}</span><span>{formatAttemptAverage(average(recentAttempts))}</span></dd>
            </div>
            <div>
              <dt>生涯平均</dt>
              <dd><span>{formatAverage(average(timingStats.winDurationsMs))}</span><span>{formatAttemptAverage(average(timingStats.winAttempts))}</span></dd>
            </div>
          </dl>
          <p className="stats-note">平均值仅统计成功猜出的对局</p>
        </aside>
      )}
      </div>

      <footer>芊年人间出品·东方 Project 同人小游戏</footer>

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="关闭" onClick={() => setShowHelp(false)}>×</button>
            <p className="eyebrow">How to play</p>
            <h2 id="help-title">八次机会，找到她</h2>
            <p>输入任意候选角色。每次猜测后，标签会告诉你与答案的距离。</p>
            <div className="help-row"><i className="match" /><span><b>命中</b>：这个标签完全一致。</span></div>
            <div className="help-row"><i className="close" /><span><b>接近</b>：数值标签相差不超过 5、分类标签同大类但不同小类，或命中“完全+接近匹配”的后续标签。</span></div>
            <div className="help-row"><i className="match" /><span><b>多标签</b>：完全匹配模式要求完整组合重合；按类模式只需大类、小类各有重合项。</span></div>
            <div className="help-row"><i className="miss" /><span><b>不符</b>：继续缩小范围。箭头提示答案更高或更低。</span></div>
          </section>
        </div>
      )}

      {showHistory && (
        <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
          <section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="关闭" onClick={() => setShowHistory(false)}>×</button>
            <p className="eyebrow">Play history</p>
            <h2 id="history-title">游玩历史</h2>
            <p className="history-summary">共保存 {gameRecords.length} 局，最近游玩的对局排在前面。</p>
            {gameRecords.length ? (
              <div className="history-list">
                {gameRecords.map((record) => {
                  const isActive = !record.completed && activeGameSessionIds.has(record.sessionId);
                  return (
                    <details className="history-record" key={record.sessionId}>
                      <summary>
                        <span className={`history-result ${record.completed ? (record.won ? "won" : "lost") : isActive ? "active" : "abandoned"}`}>
                          {formatRecordResult(record, isActive)}
                        </span>
                        <span className="history-answer">{record.completed ? record.answerName : "答案将在本局结束后显示"}</span>
                        <span className="history-meta">
                          {formatRecordMode(record.mode)} · {record.guesses.length} 次猜测 · {formatDuration(record.durationMs)}
                        </span>
                        <time>{formatRecordTime(record.updatedAt ?? record.createdAt)}</time>
                      </summary>
                      <div className="history-details">
                        {record.guesses.length ? (
                          <ol>
                            {record.guesses.map((guess, index) => {
                              const matches = guess.feedback.filter((item) => item.state === "match").length;
                              const close = guess.feedback.filter((item) => item.state === "close").length;
                              return (
                                <li key={`${guess.id}-${index}`}>
                                  <span>第 {index + 1} 次 · {guess.name}</span>
                                  <span>{matches} 项命中 · {close} 项接近</span>
                                  <b>{guess.elapsedMs === null ? "—" : formatDuration(guess.elapsedMs)}</b>
                                </li>
                              );
                            })}
                          </ol>
                        ) : <p>这局还没有提交猜测。</p>}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : <p className="empty-history history-empty">还没有游玩历史，开始一局后记录会显示在这里。</p>}
          </section>
        </div>
      )}
    </main>
  );
}

function formatRecordMode(mode: LocalGameMode) {
  return mode === "daily" ? "每日挑战" : mode === "unlimited" ? "无限模式" : "自定义模式";
}

function formatRecordResult(record: GameRecord, isActive: boolean) {
  if (!record.completed) return isActive ? "进行中" : "已放弃";
  return record.won ? "已猜中" : "未猜出";
}

function formatRecordTime(timestamp: number | null) {
  if (timestamp === null) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function formatDuration(durationMs: number) {
  const tenths = Math.max(0, Math.floor(durationMs / 100));
  const hours = Math.floor(tenths / 36000);
  const minutes = Math.floor((tenths % 36000) / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const decimal = tenths % 10;
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${decimal}`;
}

function formatAverage(durationMs: number | null) {
  return durationMs === null ? "—" : formatDuration(durationMs);
}

function formatAttemptAverage(attempts: number | null) {
  return attempts === null ? "—" : `${attempts.toFixed(1)} 次`;
}
