CREATE TYPE "public"."brand_enum" AS ENUM('TJ', 'KY');--> statement-breakpoint
CREATE TYPE "public"."number_status" AS ENUM('AVAILABLE', 'UNSUPPORTED');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"visit_date" date NOT NULL,
	"venue" text NOT NULL,
	"brand" "brand_enum" NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_numbers" (
	"song_id" uuid NOT NULL,
	"brand" "brand_enum" NOT NULL,
	"number" text,
	"status" "number_status" NOT NULL,
	CONSTRAINT "song_numbers_song_id_brand_pk" PRIMARY KEY("song_id","brand"),
	CONSTRAINT "song_numbers_available_requires_number" CHECK ("song_numbers"."status" <> 'AVAILABLE' OR "song_numbers"."number" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text,
	"artist" text,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_numbers" ADD CONSTRAINT "song_numbers_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entries_session" ON "entries" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "idx_sessions_owner_date" ON "sessions" USING btree ("owner_id","visit_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_open" ON "sessions" USING btree ("owner_id") WHERE "sessions"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_songs_owner" ON "songs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_songs_trgm" ON "songs" USING gin ((coalesce("title", '') || ' ' || coalesce("artist", '') || ' ' || coalesce("memo", '')) gin_trgm_ops);