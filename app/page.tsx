import type { Metadata } from "next";
import { GameBoard } from "./game-board";

export const metadata: Metadata = {
  title: "东方一把｜猜东方 Project 角色",
  description: "八次机会，根据角色标签反馈猜出今天的东方 Project 角色。",
};

export default function Home() {
  return <GameBoard />;
}
