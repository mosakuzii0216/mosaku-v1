-- CreateTable
CREATE TABLE "mcp_oauth_clients" (
    "id" TEXT NOT NULL,
    "client_name" VARCHAR(255) NOT NULL,
    "redirect_uris" TEXT[],
    "grant_types" TEXT[],
    "token_endpoint_auth_method" VARCHAR(100) NOT NULL DEFAULT 'none',
    "client_secret_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_auth_codes" (
    "code" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" VARCHAR(10) NOT NULL DEFAULT 'S256',
    "scope" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_auth_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "mcp_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_auth_codes_client_id_idx" ON "mcp_auth_codes"("client_id");

-- CreateIndex
CREATE INDEX "mcp_auth_codes_user_id_idx" ON "mcp_auth_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_refresh_tokens_token_hash_key" ON "mcp_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "mcp_refresh_tokens_client_id_idx" ON "mcp_refresh_tokens"("client_id");

-- CreateIndex
CREATE INDEX "mcp_refresh_tokens_user_id_idx" ON "mcp_refresh_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_refresh_tokens" ADD CONSTRAINT "mcp_refresh_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_refresh_tokens" ADD CONSTRAINT "mcp_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
