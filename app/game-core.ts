export type MatchState = "match" | "close" | "miss";
export type TagKind = "exact" | "exact-close" | "ordered" | "category" | "exact-multi" | "category-multi";

export type TagValueEntry = {
  value: string;
  category?: string;
};

export type TagDefinition = {
  id: number;
  name: string;
  kind: TagKind;
  unit: string;
};

export type CharacterValue = {
  tagId: number;
  value: string;
  category?: string;
  entries?: TagValueEntry[];
};

export type GuessFeedback = {
  tagId: number;
  value: string;
  category?: string;
  matches?: TagValueEntry[];
  matchedCategories?: string[];
  matchedValues?: string[];
  state: MatchState;
  direction?: "higher" | "lower";
};

export function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·・_-]/g, "");
}

function entriesFor(item: CharacterValue | undefined): TagValueEntry[] {
  if (item?.entries) {
    return item.entries
      .map((entry) => ({ value: entry.value.trim(), ...(entry.category?.trim() ? { category: entry.category.trim() } : {}) }))
      .filter((entry) => entry.value || entry.category);
  }
  if (!item) return [];
  return [{ value: item.value, ...(item.category ? { category: item.category } : {}) }];
}

function sameEntry(left: TagValueEntry, right: TagValueEntry) {
  return normalizeName(left.value) === normalizeName(right.value) &&
    normalizeName(left.category ?? "") === normalizeName(right.category ?? "");
}

function uniqueEntries(entries: TagValueEntry[]) {
  return entries.filter((entry, index) => entries.findIndex((candidate) => sameEntry(candidate, entry)) === index);
}

function uniqueNames(values: string[]) {
  return values.filter((value, index) => values.findIndex((candidate) => normalizeName(candidate) === normalizeName(value)) === index);
}

function parseExactCloseValue(source: string) {
  const separatorIndex = source.indexOf(">");
  if (separatorIndex < 0) return { primary: source.trim(), close: [] as string[] };
  return {
    primary: source.slice(0, separatorIndex).trim(),
    close: source.slice(separatorIndex + 1).split("|").map((item) => item.trim()).filter(Boolean),
  };
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

    if (tag.kind === "exact-close") {
      const guessedLabel = parseExactCloseValue(value).primary;
      const targetLabels = parseExactCloseValue(target);
      if (normalizeName(guessedLabel) === normalizeName(targetLabels.primary)) {
        return { tagId: tag.id, value: guessedLabel, state: "match" };
      }
      if (targetLabels.close.some((label) => normalizeName(guessedLabel) === normalizeName(label))) {
        return { tagId: tag.id, value: guessedLabel, state: "close" };
      }
      return { tagId: tag.id, value: guessedLabel, state: "miss" };
    }

    if (tag.kind === "category-multi") {
      const guessedEntries = entriesFor(guessedValue);
      const answerEntries = entriesFor(answerValue);
      const matchedCategories = uniqueNames(
        guessedEntries
          .map((entry) => entry.category?.trim() ?? "")
          .filter((guessedCategory) => guessedCategory && answerEntries.some((entry) => normalizeName(entry.category ?? "") === normalizeName(guessedCategory))),
      );
      const matchedValues = uniqueNames(
        guessedEntries
          .map((entry) => entry.value.trim())
          .filter((guessedSmallValue) => guessedSmallValue && answerEntries.some((entry) => normalizeName(entry.value) === normalizeName(guessedSmallValue))),
      );
      const hasMatchedEmptyValue = guessedEntries.some((guessedEntry) => {
        const guessedCategory = guessedEntry.category?.trim() ?? "";
        return guessedCategory && !guessedEntry.value.trim() && answerEntries.some((answerEntry) => (
          !answerEntry.value.trim() &&
          normalizeName(answerEntry.category ?? "") === normalizeName(guessedCategory)
        ));
      });

      if (matchedCategories.length && (matchedValues.length || hasMatchedEmptyValue)) {
        return {
          tagId: tag.id,
          value: matchedValues.join("、"),
          matchedCategories,
          matchedValues,
          state: "match",
        };
      }
      if (matchedCategories.length) {
        return { tagId: tag.id, value: "无小类匹配", matchedCategories, matchedValues: [], state: "close" };
      }
      return { tagId: tag.id, value: "无匹配", matchedCategories: [], matchedValues: [], state: "miss" };
    }

    if (tag.kind === "exact-multi") {
      const guessedEntries = entriesFor(guessedValue);
      const answerEntries = entriesFor(answerValue);
      const exactMatches = uniqueEntries(guessedEntries.filter((entry) => answerEntries.some((targetEntry) => sameEntry(entry, targetEntry))));
      if (exactMatches.length) {
        return { tagId: tag.id, value: exactMatches.map((entry) => entry.value).join("、"), matches: exactMatches, state: "match" };
      }
      return { tagId: tag.id, value: "无匹配", matches: [], state: "miss" };
    }

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
