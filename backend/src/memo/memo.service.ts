import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';

@Injectable()
export class MemoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(supabaseUserId: string, tagIds?: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const whereClause: any = { userId: user.id };

    // Filter by tags if provided
    if (tagIds && tagIds.length > 0) {
      whereClause.memoTags = {
        some: {
          tagId: { in: tagIds },
        },
      };
    }

    return this.prisma.memo.findMany({
      where: whereClause,
      include: {
        memoTags: {
          include: {
            tag: true,
          },
        },
        theme: {
          select: {
            id: true,
            name: true,
            styles: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOne(id: string, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memo = await this.prisma.memo.findUnique({
      where: { id },
      include: {
        memoTags: {
          include: {
            tag: true,
          },
        },
        theme: {
          select: {
            id: true,
            name: true,
            styles: true,
          },
        },
      },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${id} not found`);
    }

    if (memo.userId !== user.id) {
      throw new ForbiddenException('You can only access your own memos');
    }

    return memo;
  }

  async create(createMemoDto: CreateMemoDto, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const createData: any = {
      title: createMemoDto.title,
      content: createMemoDto.content,
      userId: user.id,
    };

    // テーマIDが指定されている場合は関連付け
    if (createMemoDto.themeId) {
      createData.themeId = createMemoDto.themeId;
    }

    return this.prisma.memo.create({
      data: createData,
      include: {
        theme: {
          select: {
            id: true,
            name: true,
            styles: true,
          },
        },
      },
    });
  }

  async update(
    id: string,
    updateMemoDto: UpdateMemoDto,
    supabaseUserId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memo = await this.prisma.memo.findUnique({
      where: { id },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${id} not found`);
    }

    if (memo.userId !== user.id) {
      throw new ForbiddenException('You can only update your own memos');
    }

    return this.prisma.memo.update({
      where: { id },
      data: updateMemoDto,
      include: {
        theme: {
          select: {
            id: true,
            name: true,
            styles: true,
          },
        },
      },
    });
  }

  async remove(id: string, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memo = await this.prisma.memo.findUnique({
      where: { id },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${id} not found`);
    }

    if (memo.userId !== user.id) {
      throw new ForbiddenException('You can only delete your own memos');
    }

    return this.prisma.memo.delete({
      where: { id },
    });
  }

  async search(query: string, supabaseUserId: string, tagIds?: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!query) {
      return this.findAll(supabaseUserId, tagIds);
    }

    const whereClause: any = {
      userId: user.id,
      OR: [
        {
          title: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          content: {
            contains: query,
            mode: 'insensitive',
          },
        },
      ],
    };

    // Filter by tags if provided
    if (tagIds && tagIds.length > 0) {
      whereClause.memoTags = {
        some: {
          tagId: { in: tagIds },
        },
      };
    }

    return this.prisma.memo.findMany({
      where: whereClause,
      include: {
        memoTags: {
          include: {
            tag: true,
          },
        },
        theme: {
          select: {
            id: true,
            name: true,
            styles: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }
}
