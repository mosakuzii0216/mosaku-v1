import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ThemeService } from './theme.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/services/authorization.service';
import { CreateThemeDto } from './dto/create-theme.dto';

const mockTheme = (overrides: Record<string, unknown> = {}) => ({
	id: 'theme-1',
	name: 'Test Theme',
	description: null,
	isSystem: false,
	isPublic: false,
	styles: {},
	cssFilePath: null,
	metadata: {},
	createdById: 'user-1',
	createdAt: new Date(),
	updatedAt: new Date(),
	createdBy: { id: 'user-1', name: 'Test User' },
	userFavorites: [],
	_count: { userFavorites: 0, notebooks: 0 },
	...overrides,
});

const mockPrismaService = {
	theme: {
		findMany: jest.fn(),
		findUnique: jest.fn(),
		create: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
	},
	userFavoriteTheme: {
		findUnique: jest.fn(),
		findMany: jest.fn(),
		create: jest.fn(),
		delete: jest.fn(),
	},
};

describe('ThemeService', () => {
	let service: ThemeService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ThemeService,
				{ provide: PrismaService, useValue: mockPrismaService },
				AuthorizationService, // 実際の AuthorizationService を使用
			],
		}).compile();

		service = module.get<ThemeService>(ThemeService);
		jest.clearAllMocks();
	});

	// ─── findOne() ──────────────────────────────────────────────────────────────

	describe('findOne()', () => {
		it('should throw 404 when theme does not exist', async () => {
			mockPrismaService.theme.findUnique.mockResolvedValue(null);

			await expect(service.findOne('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when theme is private and not owned by the requesting user', async () => {
			const theme = mockTheme({ isSystem: false, isPublic: false, createdById: 'other-user' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(service.findOne('theme-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('should allow access to a system theme without ownership', async () => {
			const theme = mockTheme({ isSystem: true, createdById: 'other-user' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			const result = await service.findOne('theme-1', 'user-1');

			expect(result.id).toBe('theme-1');
		});

		it('should allow access to a public theme without ownership', async () => {
			const theme = mockTheme({ isPublic: true, createdById: 'other-user' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			const result = await service.findOne('theme-1', 'user-1');

			expect(result.id).toBe('theme-1');
		});

		it('should compute isFavorited/favoriteCount/usageCount and strip internal fields', async () => {
			const theme = mockTheme({
				userFavorites: [{ userId: 'user-1' }],
				_count: { userFavorites: 3, notebooks: 5 },
			});
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			const result = await service.findOne('theme-1', 'user-1');

			expect(result.isFavorited).toBe(true);
			expect(result.favoriteCount).toBe(3);
			expect(result.usageCount).toBe(5);
			expect(result.userFavorites).toBeUndefined();
			expect(result._count).toBeUndefined();
		});
	});

	// ─── create() ───────────────────────────────────────────────────────────────

	describe('create()', () => {
		it('should throw 400 when neither cssFilePath nor styles is provided', async () => {
			const dto: CreateThemeDto = { name: 'New Theme' };

			await expect(service.create(dto, 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.BAD_REQUEST,
			});
			expect(mockPrismaService.theme.create).not.toHaveBeenCalled();
		});

		it('should throw 400 when styles is missing a required field', async () => {
			const dto: CreateThemeDto = {
				name: 'New Theme',
				styles: { colors: {}, typography: {} },
			};

			await expect(service.create(dto, 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.BAD_REQUEST,
			});
			expect(mockPrismaService.theme.create).not.toHaveBeenCalled();
		});

		it('should create a theme when cssFilePath is provided without styles', async () => {
			const created = mockTheme({ cssFilePath: '/themes/foo.css' });
			mockPrismaService.theme.create.mockResolvedValue(created);
			const dto: CreateThemeDto = { name: 'New Theme', cssFilePath: '/themes/foo.css' };

			const result = await service.create(dto, 'user-1');

			expect(mockPrismaService.theme.create).toHaveBeenCalledWith(
				expect.objectContaining({
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					data: expect.objectContaining({ isSystem: false, createdById: 'user-1' }),
				}),
			);
			expect(result).toEqual(created);
		});

		it('should create a theme when all required style fields are present', async () => {
			const created = mockTheme();
			mockPrismaService.theme.create.mockResolvedValue(created);
			const dto: CreateThemeDto = {
				name: 'New Theme',
				styles: { colors: {}, typography: {}, layout: {} },
			};

			await service.create(dto, 'user-1');

			expect(mockPrismaService.theme.create).toHaveBeenCalledTimes(1);
		});
	});

	// ─── update() ───────────────────────────────────────────────────────────────

	describe('update()', () => {
		it('should throw 404 when theme does not exist', async () => {
			mockPrismaService.theme.findUnique.mockResolvedValue(null);

			await expect(service.update('nonexistent', {}, 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when theme is a system theme', async () => {
			const theme = mockTheme({ isSystem: true, createdById: 'user-1' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(service.update('theme-1', {}, 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('should throw 403 when theme belongs to another user', async () => {
			const theme = mockTheme({ createdById: 'other-user' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(service.update('theme-1', {}, 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('should throw 400 when styles is not an object', async () => {
			const theme = mockTheme({ createdById: 'user-1' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(
				service.update('theme-1', { styles: 'not-an-object' } as never, 'user-1'),
			).rejects.toMatchObject({ statusCode: HttpStatus.BAD_REQUEST });
			expect(mockPrismaService.theme.update).not.toHaveBeenCalled();
		});

		it('should update the theme when owned by the requesting user', async () => {
			const theme = mockTheme({ createdById: 'user-1' });
			const updated = mockTheme({ createdById: 'user-1', name: 'Renamed' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);
			mockPrismaService.theme.update.mockResolvedValue(updated);

			const result = await service.update('theme-1', { name: 'Renamed' }, 'user-1');

			expect(mockPrismaService.theme.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'theme-1' },
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					data: expect.objectContaining({ name: 'Renamed' }),
				}),
			);
			expect(result).toEqual(updated);
		});
	});

	// ─── remove() ───────────────────────────────────────────────────────────────

	describe('remove()', () => {
		it('should throw 404 when theme does not exist', async () => {
			mockPrismaService.theme.findUnique.mockResolvedValue(null);

			await expect(service.remove('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when theme belongs to another user', async () => {
			const theme = mockTheme({ createdById: 'other-user', _count: { notebooks: 0 } });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(service.remove('theme-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('should throw 400 when the theme is currently in use by notebooks', async () => {
			const theme = mockTheme({ createdById: 'user-1', _count: { notebooks: 2 } });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(service.remove('theme-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.BAD_REQUEST,
			});
			expect(mockPrismaService.theme.delete).not.toHaveBeenCalled();
		});

		it('should delete the theme when owned and unused', async () => {
			const theme = mockTheme({ createdById: 'user-1', _count: { notebooks: 0 } });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);
			mockPrismaService.theme.delete.mockResolvedValue(theme);

			const result = await service.remove('theme-1', 'user-1');

			expect(mockPrismaService.theme.delete).toHaveBeenCalledWith({ where: { id: 'theme-1' } });
			expect(result).toEqual({ message: 'テーマを削除しました' });
		});
	});

	// ─── addToFavorites() ───────────────────────────────────────────────────────

	describe('addToFavorites()', () => {
		it('should throw 404 when theme does not exist', async () => {
			mockPrismaService.theme.findUnique.mockResolvedValue(null);

			await expect(service.addToFavorites('nonexistent', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
		});

		it('should throw 403 when the theme is not accessible to the user', async () => {
			const theme = mockTheme({ isSystem: false, isPublic: false, createdById: 'other-user' });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);

			await expect(service.addToFavorites('theme-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.FORBIDDEN,
			});
		});

		it('should throw 400 when already favorited', async () => {
			const theme = mockTheme({ isSystem: true });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);
			mockPrismaService.userFavoriteTheme.findUnique.mockResolvedValue({
				userId: 'user-1',
				themeId: 'theme-1',
			});

			await expect(service.addToFavorites('theme-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.BAD_REQUEST,
			});
			expect(mockPrismaService.userFavoriteTheme.create).not.toHaveBeenCalled();
		});

		it('should add the theme to favorites when accessible and not already favorited', async () => {
			const theme = mockTheme({ isSystem: true });
			mockPrismaService.theme.findUnique.mockResolvedValue(theme);
			mockPrismaService.userFavoriteTheme.findUnique.mockResolvedValue(null);
			mockPrismaService.userFavoriteTheme.create.mockResolvedValue({
				userId: 'user-1',
				themeId: 'theme-1',
			});

			const result = await service.addToFavorites('theme-1', 'user-1');

			expect(mockPrismaService.userFavoriteTheme.create).toHaveBeenCalledWith({
				data: { userId: 'user-1', themeId: 'theme-1' },
			});
			expect(result).toEqual({ message: 'お気に入りに追加しました' });
		});
	});

	// ─── removeFromFavorites() ──────────────────────────────────────────────────

	describe('removeFromFavorites()', () => {
		it('should throw 404 when the favorite does not exist', async () => {
			mockPrismaService.userFavoriteTheme.findUnique.mockResolvedValue(null);

			await expect(service.removeFromFavorites('theme-1', 'user-1')).rejects.toMatchObject({
				statusCode: HttpStatus.NOT_FOUND,
			});
			expect(mockPrismaService.userFavoriteTheme.delete).not.toHaveBeenCalled();
		});

		it('should delete the favorite when it exists', async () => {
			mockPrismaService.userFavoriteTheme.findUnique.mockResolvedValue({
				userId: 'user-1',
				themeId: 'theme-1',
			});
			mockPrismaService.userFavoriteTheme.delete.mockResolvedValue({
				userId: 'user-1',
				themeId: 'theme-1',
			});

			const result = await service.removeFromFavorites('theme-1', 'user-1');

			expect(mockPrismaService.userFavoriteTheme.delete).toHaveBeenCalledWith({
				where: { userId_themeId: { userId: 'user-1', themeId: 'theme-1' } },
			});
			expect(result).toEqual({ message: 'お気に入りから削除しました' });
		});
	});

	// ─── getUserFavorites() ─────────────────────────────────────────────────────

	describe('getUserFavorites()', () => {
		it('should map favorites to themes with isFavorited/favoriteCount/usageCount', async () => {
			const favorite = {
				theme: mockTheme({ _count: { userFavorites: 4, notebooks: 1 } }),
			};
			mockPrismaService.userFavoriteTheme.findMany.mockResolvedValue([favorite]);

			const result = await service.getUserFavorites('user-1');

			expect(result).toHaveLength(1);
			expect(result[0].isFavorited).toBe(true);
			expect(result[0].favoriteCount).toBe(4);
			expect(result[0].usageCount).toBe(1);
			expect(result[0]._count).toBeUndefined();
		});

		it('should return an empty array when the user has no favorites', async () => {
			mockPrismaService.userFavoriteTheme.findMany.mockResolvedValue([]);

			const result = await service.getUserFavorites('user-1');

			expect(result).toEqual([]);
		});
	});
});
