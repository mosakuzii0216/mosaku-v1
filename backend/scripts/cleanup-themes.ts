import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// さっき追加したCSSテーマのリスト（cssFilePathで識別）
const KEEP_CSS = [
  'ao/ao.css',
  'aka/aka.css',
  'ki/ki.css',
  'midori/midori.css',
  'siro/siro.css',
  'kuro/kuro.css',
  'violet/violet.css',
]

async function main() {
  const apply = process.argv.includes('--apply')

  // 削除対象: cssFilePathがKEEPに含まれない全テーマ（null含む）
  const toDelete = await prisma.theme.findMany({
    where: {
      OR: [
        { cssFilePath: null },
        { cssFilePath: { notIn: KEEP_CSS } },
      ],
    },
    select: { id: true, name: true, cssFilePath: true, isSystem: true, isPublic: true },
    orderBy: { name: 'asc' },
  })

  // eslint-disable-next-line no-console
  console.log(`\n[Preview] 削除対象件数: ${toDelete.length}`)
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(toDelete, null, 2))

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('\nDry run (use --apply to delete).')
    return
  }

  // 実削除
  const res = await prisma.theme.deleteMany({
    where: {
      OR: [
        { cssFilePath: null },
        { cssFilePath: { notIn: KEEP_CSS } },
      ],
    },
  })

  // eslint-disable-next-line no-console
  console.log(`\nDeleted ${res.count} themes.`)
}

if (require.main === module) {
  main()
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

