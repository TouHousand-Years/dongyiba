export type MatchState = "match" | "close" | "miss";

export type TagDefinition = {
  id: number;
  name: string;
  kind: "exact" | "ordered" | "category";
  unit: string;
};

export type CharacterValue = {
  tagId: number;
  value: string;
  category?: string;
};

export type GuessFeedback = {
  tagId: number;
  value: string;
  category?: string;
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
  const guessed = new Map(guessValues.map((item) => [item.tagId, item]));
  const answer = new Map(answerValues.map((item) => [item.tagId, item]));

  return tags.map((tag) => {
    const guessedValue = guessed.get(tag.id);
    const answerValue = answer.get(tag.id);
    const value = guessedValue?.value ?? "未知";
    const target = answerValue?.value ?? "";
    const category = guessedValue?.category?.trim() ?? "";
    const targetCategory = answerValue?.category?.trim() ?? "";

    if (
      normalizeName(value) === normalizeName(target) &&
      (tag.kind !== "category" || normalizeName(category) === normalizeName(targetCategory))
    ) {
      return { tagId: tag.id, value, ...(category ? { category } : {}), state: "match" };
    }

    if (
      tag.kind === "category" &&
      category &&
      targetCategory &&
      normalizeName(category) === normalizeName(targetCategory)
    ) {
      return { tagId: tag.id, value, category, state: "close" };
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

    return { tagId: tag.id, value, ...(category ? { category } : {}), state: "miss" };
  });
}
