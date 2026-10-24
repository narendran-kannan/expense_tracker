-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "query" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "driver" TEXT NOT NULL DEFAULT 'debug',
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineItem" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "email_message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineRun_status_started_at_idx" ON "PipelineRun"("status", "started_at");

-- CreateIndex
CREATE INDEX "PipelineItem_run_id_status_created_at_idx" ON "PipelineItem"("run_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineItem_run_id_email_message_id_key" ON "PipelineItem"("run_id", "email_message_id");

-- AddForeignKey
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
