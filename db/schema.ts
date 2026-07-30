import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  aliases: text("aliases").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  kind: text("kind", { enum: ["exact", "ordered"] }).notNull().default("exact"),
  unit: text("unit").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const characterTagValues = sqliteTable(
  "character_tag_values",
  {
    characterId: integer("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
    value: text("value").notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.characterId, table.tagId] })],
);

export const gameSessions = sqliteTable("game_sessions", {
  id: text("id").primaryKey(),
  answerCharacterId: integer("answer_character_id").notNull().references(() => characters.id),
  mode: text("mode", { enum: ["daily", "unlimited"] }).notNull(),
  dayKey: text("day_key").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});
