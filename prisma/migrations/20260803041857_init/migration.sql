-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('PENDING', 'PICKED_UP', 'IN_TRANSIT', 'CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ConversationSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('PENDING', 'RESPONDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "description" TEXT,
    "originCity" TEXT,
    "destinationCity" TEXT,
    "carrier" TEXT,
    "weightKg" DOUBLE PRECISION,
    "status" "PackageStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedDelivery" TIMESTAMP(3),
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "PackageStatus" NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionSurvey" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "SurveyStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "score" INTEGER,
    "comment" TEXT,

    CONSTRAINT "SatisfactionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "ConversationSessionStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warnedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Package_trackingNumber_key" ON "Package"("trackingNumber");

-- CreateIndex
CREATE INDEX "Package_status_idx" ON "Package"("status");

-- CreateIndex
CREATE INDEX "TrackingEvent_packageId_occurredAt_idx" ON "TrackingEvent"("packageId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionSurvey_packageId_key" ON "SatisfactionSurvey"("packageId");

-- CreateIndex
CREATE INDEX "SatisfactionSurvey_phone_status_idx" ON "SatisfactionSurvey"("phone", "status");

-- CreateIndex
CREATE INDEX "ConversationSession_phone_status_idx" ON "ConversationSession"("phone", "status");

-- CreateIndex
CREATE INDEX "ConversationMessage_sessionId_createdAt_idx" ON "ConversationMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Escalation_phone_idx" ON "Escalation"("phone");

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionSurvey" ADD CONSTRAINT "SatisfactionSurvey_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
