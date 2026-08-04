export type MatchState = "match" | "close" | "miss";

export type TagDefinition = {
  id: number;
  name: string;
  kind: "exact" | "ordered";
  unit: string;
};

export type CharacterValue = {
  tagId: number;
  value: string;
};

export type GuessFeedback = {
  tagId: number;
  value: string;
  state: MatchState;
  direction?: "higher" | "lower";
};

export function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·・_-]/g, "");
}

export function compareGuess(
  tags: TagDefinition[],
  guessValues: CharacterValue[],
  answerValues: CharacterValue[],
): GuessFeedback[] {
  const guessed = new Map(guessValues.map((item) => [item.tagId, item.value]));
  const answer = new Map(answerValues.map((item) => [item.tagId, item.value]));

  return tags.map((tag) => {
    const value = guessed.get(tag.id) ?? "未知";
    const target = answer.get(tag.id) ?? "";
    if (normalizeName(value) === normalizeName(target)) {
      return { tagId: tag.id, value, state: "match" };
    }

    if (tag.kind === "ordered") {
      const guessNumber = Number(value);
      const answerNumber = Number(target);
      if (Number.isFinite(guessNumber) && Number.isFinite(answerNumber)) {
        return {
          tagId: tag.id,
          value,
          state: Math.abs(guessNumber - answerNumber) <= 5 ? "close" : "miss",
          direction: guessNumber < answerNumber ? "higher" : "lower",
        };
      }
    }

    return { tagId: tag.id, value, state: "miss" };
  });
}
