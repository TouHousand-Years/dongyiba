"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createNextUnlimitedGame,
  createLocalGame,
  getElapsedMs,
  getLocalAnswerName,
  loadLocalGame,
  loadTimingStats,
  recordCompletedTiming,
  saveLocalGame,
  submitLocalGuess,
  type LocalGame,
  type LocalGameMode,
  type TimingStats,
} from "./local-game";
import { loadLocalCatalog } from "./local-catalog";

export function GameBoard() {
  const [game, setGame] = useState<LocalGame | null>(null);
  const [mode, setMode] = useState<LocalGameMode>("daily");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("正在读取题库……");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [timingStats, setTimingStats] = useState<TimingStats>({
    completedSessionIds: [],
    winDurationsMs: [],
  });

  function start(nextMode: LocalGameMode = mode, forceNew = false) {
    setBusy(true);
    try {
      const catalog = loadLocalCatalog();
      const restored = forceNew ? null : loadLocalGame(nextMode, catalog);
      const nextGame = restored ?? createLocalGame(catalog, nextMode);
      if (!restored) saveLocalGame(nextGame);
      setTimingStats(nextGame.completed ? recordCompletedTiming(nextGame) : loadTimingStats());
      setGame(nextGame);
      setNow(Date.now());
      setQuery("");
      setAnswer(nextGame.completed ? getLocalAnswerName(catalog, nextGame) : "");
      setMessage(
        nextGame.completed
          ? `本局已结束，答案是 ${getLocalAnswerName(catalog, nextGame)}。`
          : nextMode === "daily"
            ? "输入角色名，开始今天这一把。"
            : "新角色已藏好，来猜吧。",
      );
    } catch {
      setMessage("题库尚未配置完成，请打开标签后台检查。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Initial data loading intentionally hydrates this client-only game board.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    start("daily");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!game || game.timerStartedAt === null || game.completed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [game]);

  const suggestions = useMemo(() => {
    if (!game || query.trim().length < 1) return [];
    return game.names
      .filter((name) => name.includes(query.trim()) && !game.guesses.some((guess) => guess.name === name))
      .slice(0, 6);
  }, [game, query]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!game || !query.trim() || answer || busy) return;
    setBusy(true);
    try {
      const result = submitLocalGuess(loadLocalCatalog(), game, query, Date.now());
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setGame(result.game);
      saveLocalGame(result.game);
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
  const average = (durations: number[]) => durations.length
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : null;

  function nextUnlimitedRound() {
    if (!game || game.mode !== "unlimited" || !game.completed) return;
    setBusy(true);
    try {
      const nextGame = createNextUnlimitedGame(loadLocalCatalog(), game);
      saveLocalGame(nextGame);
      setGame(nextGame);
      setQuery("");
      setAnswer("");
      setNow(Date.now());
      setMessage("新角色已藏好，来猜吧。");
    } catch {
      setMessage("下一轮未能开始，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="game-shell">
      <div className="mist mist-one" />
      <div className="mist mist-two" />
      <header className="topbar">
        <p className="challenge">每日挑战 #{game?.challengeNumber ?? "—"}</p>
        <Link className="admin-link" href="/admin">标签后台</Link>
        <button className="ghost-button" onClick={() => setShowHelp(true)}>游戏玩法</button>
      </header>

      <section className="hero">
        <div className="crest" aria-hidden="true">東</div>
        <p className="eyebrow">Gensokyo character puzzle</p>
        <h1>东一把</h1>
        <p className="subtitle">猜出隐藏的那位幻想乡角色</p>
      </section>

      <section className="status-strip" aria-label="今日挑战状态">
        <span><b>{game?.names.length ?? "—"}</b> 位角色</span>
        <span><b>{game?.maxAttempts ?? 8}</b> 次机会</span>
        <span><b>{attemptsLeft}</b> 次剩余</span>
      </section>

      {game && timerVisible && (
        <section className="timer-strip" aria-label="游戏计时" aria-live="off">
          {mode === "unlimited" && <span><small>总用时</small><b>{formatDuration(totalElapsedMs)}</b></span>}
          <span><small>{mode === "unlimited" ? "当前人物" : "本局用时"}</small><b>{formatDuration(elapsedMs)}</b></span>
        </section>
      )}

      <div className={`play-layout ${mode === "unlimited" ? "with-stats" : ""}`}>
      <section className="game-card" aria-label="东一把游戏挑战">
        <div className="mode-switch" aria-label="选择游戏模式">
          {(["daily", "unlimited"] as const).map((item) => (
            <button
              key={item}
              className={mode === item ? "active" : ""}
              aria-pressed={mode === item}
              onClick={() => { setMode(item); start(item, true); }}
            >
              {item === "daily" ? "每日挑战" : "无限模式"}
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
          <button className="again-button" onClick={() => mode === "unlimited" ? nextUnlimitedRound() : start(mode, true)}>
            {mode === "daily" ? "再看一遍" : "下一位角色"}
          </button>
        )}

        <div className="legend">
          <span><i className="match" />命中</span>
          <span><i className="close" />接近</span>
          <span><i className="miss" />不符</span>
        </div>
      </section>

      {mode === "unlimited" && game && (
        <aside className="timing-panel" aria-label="无限模式用时统计">
          <p className="eyebrow">Run history</p>
          <h2>本次游戏</h2>
          {game.unlimitedHistory.length ? (
            <ol className="round-history">
              {[...game.unlimitedHistory].reverse().map((round) => (
                <li key={round.round}>
                  <span>第 {round.round} 轮 · {round.answer}</span>
                  <b>{round.won ? formatDuration(round.durationMs) : "未猜出"}</b>
                </li>
              ))}
            </ol>
          ) : <p className="empty-history">完成当前人物后，这里会记录前几轮用时。</p>}
          <dl className="averages">
            <div><dt>最近 10 次平均</dt><dd>{formatAverage(average(recentDurations))}</dd></div>
            <div><dt>生涯平均用时</dt><dd>{formatAverage(average(timingStats.winDurationsMs))}</dd></div>
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
            <div className="help-row"><i className="close" /><span><b>接近</b>：数值标签相差不超过 5，或分类标签同大类但不同小类。</span></div>
            <div className="help-row"><i className="match" /><span><b>多标签</b>：完全匹配模式要求完整组合重合；按类模式只需大类、小类各有重合项。</span></div>
            <div className="help-row"><i className="miss" /><span><b>不符</b>：继续缩小范围。箭头提示答案更高或更低。</span></div>
          </section>
        </div>
      )}
    </main>
  );
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
