import { PrismaClient } from '@prisma/client';

type CssThemeSeed = {
	slug: string;
	name: string;
	description?: string;
	isSystem: boolean;
	isPublic: boolean;
	cssFilePath: string;
	metadata?: Record<string, any>;
};

// Minimal CSS-file based themes derived from frontend/public/themes/*
export const cssThemes: CssThemeSeed[] = [
	{
		slug: 'ao',
		name: 'AO',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'ao/ao.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#1C5DB6' },
	},
	{
		slug: 'aka',
		name: '朱',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'aka/aka.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#C53030' },
	},
	{
		slug: 'ki',
		name: 'Ki',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'ki/ki.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#B45309' },
	},
	{
		slug: 'midori',
		name: '緑',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'midori/midori.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#15803D' },
	},
	{
		slug: 'siro',
		name: 'Siro',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'siro/siro.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#1F2937' },
	},
	{
		slug: 'kuro',
		name: 'Kuro',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'kuro/kuro.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#0F172A' },
	},
	{
		slug: 'violet',
		name: 'Violet',
		description: '',
		isSystem: true,
		isPublic: true,
		cssFilePath: 'violet/violet.css',
		metadata: { category: 'basic', variant: 'color-minimal', previewColor: '#6D28D9' },
	},
];

// Dry-run friendly seeding script
async function main() {
	const prisma = new PrismaClient();
	const dryRun = process.argv.includes('--dry') || process.env.DRY_RUN === '1';

	// Show payload first
	// eslint-disable-next-line no-console
	console.log('\n[Dry Run Preview] Themes to upsert:');
	// eslint-disable-next-line no-console
	console.log(
		JSON.stringify(
			cssThemes.map(({ slug, ...rest }) => rest),
			null,
			2,
		),
	);

	if (dryRun) {
		// eslint-disable-next-line no-console
		console.log('\nDry run only. No changes applied.');
		await prisma.$disconnect();
		return;
	}

	// Upsert by cssFilePath + isSystem true (no unique key, so emulate)
	for (const t of cssThemes) {
		const existing = await prisma.theme.findFirst({
			where: { cssFilePath: t.cssFilePath, isSystem: true },
		});
		if (existing) {
			await prisma.theme.update({
				where: { id: existing.id },
				data: {
					name: t.name,
					description: t.description ?? null,
					isPublic: t.isPublic,
					cssFilePath: t.cssFilePath,
					metadata: t.metadata ?? {},
				},
			});
			// eslint-disable-next-line no-console
			console.log(`Updated theme: ${t.name} (${t.cssFilePath})`);
		} else {
			await prisma.theme.create({
				data: {
					name: t.name,
					description: t.description ?? null,
					isSystem: t.isSystem,
					isPublic: t.isPublic,
					cssFilePath: t.cssFilePath,
					metadata: t.metadata ?? {},
				},
			});
			// eslint-disable-next-line no-console
			console.log(`Created theme: ${t.name} (${t.cssFilePath})`);
		}
	}

	await prisma.$disconnect();
}

if (require.main === module) {
	// Default to dry-run to be safe
	main().catch((e) => {
		// eslint-disable-next-line no-console
		console.error(e);
		process.exit(1);
	});
}
