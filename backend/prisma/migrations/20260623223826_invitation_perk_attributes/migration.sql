-- CreateEnum
CREATE TYPE "InvitationPerkType" AS ENUM ('NONE', 'COMP');

-- AlterTable
ALTER TABLE "invitation_codes" ADD COLUMN     "perk_comp_months" INTEGER,
ADD COLUMN     "perk_type" "InvitationPerkType" NOT NULL DEFAULT 'NONE';
