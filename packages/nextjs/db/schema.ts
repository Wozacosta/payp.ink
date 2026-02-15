import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const articleStatusEnum = pgEnum("article_status", ["draft", "published"]);

export const articles = pgTable("articles", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  creatorAddress: text("creator_address").notNull(),
  chainId: integer("chain_id").notNull(),
  status: articleStatusEnum().default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
