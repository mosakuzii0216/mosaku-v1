import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrate: {
		dataSourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
	},
});
