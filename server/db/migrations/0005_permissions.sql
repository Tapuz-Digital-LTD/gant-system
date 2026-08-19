CREATE TABLE "role_permissions" (
	"role" "member_role" NOT NULL,
	"permission" text NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_pk" ON "role_permissions" USING btree ("role","permission");