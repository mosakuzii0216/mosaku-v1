import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getInvitationCode() {
	const codes = await prisma.invitationCode.findMany({
		select: {
			id: true,
			code: true,
			maxUses: true,
			usedCount: true,
			expiresAt: true,
		},
	});
	console.log(JSON.stringify(codes, null, 2));
	await prisma.$disconnect();
}

void getInvitationCode();
