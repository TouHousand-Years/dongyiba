"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GuessFeedback, TagDefinition } from "./game-core";

type Guess = { id: number; name: string; feedback: GuessFeedback[] };
type GameState = {
  sessionId: string;
  challengeNumber: number;
  mode: "daily" | "unlimited";
  maxAttempts: number;
  names: string[];
  tags: TagDefinition[];
};

export function GameBoard() {
  const [game, setGame] = useState<GameState | null>(null);
  const [mode, setMode] = useState<"daily" | "unlimited">("daily");
  const [query, setQuery] = useState("");
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [message, setMessage] = useState("正在准备今天的符卡……");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  async function start(nextMode = mode) {
    setBusy(true);
    try {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", mode: nextMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setGame(data);
      setGuesses([]);
      setAnswer("");
      setQuery("");
      setMessage(nextMode === "daily" ? "输入角色名，开始今天这一把。" : "新角色已藏好，来猜吧。");
    } catch {
      setMessage("暂时无法连接幻想乡，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Initial data loading intentionally hydrates this client-only game board.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start("daily");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => {
    if (!game || query.trim().length < 1) return [];
    return game.names
      .filter((name) => name.includes(query.trim()) && !guesses.some((guess) => guess.name === name))
      .slice(0, 6);
  }, [game, guesses, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!game || !query.trim() || answer || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "guess", sessionId: game.sessionId, name: query }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "没有找到这位角色。");
        return;
      }
      setGuesses((current) => [...current, data.guess]);
      setQuery("");
      setMessage(data.message);
      if (data.answer) setAnswer(data.answer);
    } catch {
      setMessage("这次猜测被境界吞掉了，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const attemptsLeft = Math.max(0, (game?.maxAttempts ?? 8) - guesses.length);

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
        <h1>东方一把</h1>
        <p className="subtitle">猜出隐藏的那位幻想乡角色</p>
      </section>

      <section className="status-strip" aria-label="今日挑战状态">
        <span><b>{game?.names.length ?? "—"}</b> 位角色</span>
        <span><b>{game?.maxAttempts ?? 8}</b> 次机会</span>
        <span><b>{attemptsLeft}</b> 次剩余</span>
      </section>

      <section className="game-card" aria-label="东方一把游戏挑战">
        <div className="mode-switch" aria-label="选择游戏模式">
          {(["daily", "unlimited"] as const).map((item) => (
            <button
              key={item}
              className={mode === item ? "active" : ""}
              aria-pressed={mode === item}
              onClick={() => { setMode(item); void start(item); }}
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
                    {guess.feedback.map((cell) => (
                      <td key={cell.tagId} className={`result-${cell.state}`}>
                        <span>{cell.value}</span>
                        {cell.direction && <i>{cell.direction === "higher" ? "↑" : "↓"}</i>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {answer && (
          <button className="again-button" onClick={() => void start(mode)}>
            {mode === "daily" ? "再看一遍" : "下一位角色"}
          </button>
        )}

        <div className="legend">
          <span><i className="match" />命中</span>
          <span><i className="close" />接近</span>
          <span><i className="miss" />不符</span>
        </div>
      </section>

      <footer>以爱与弹幕制作 · 非官方东方 Project 同人小游戏</footer>

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="关闭" onClick={() => setShowHelp(false)}>×</button>
            <p className="eyebrow">How to play</p>
            <h2 id="help-title">八次机会，找到她</h2>
            <p>输入任意候选角色。每次猜测后，标签会告诉你与答案的距离。</p>
            <div className="help-row"><i className="match" /><span><b>命中</b>：这个标签完全一致。</span></div>
            <div className="help-row"><i className="close" /><span><b>接近</b>：数值标签相差不超过 5。</span></div>
            <div className="help-row"><i className="miss" /><span><b>不符</b>：继续缩小范围。箭头提示答案更高或更低。</span></div>
          </section>
        </div>
      )}
    </main>
  );
}
