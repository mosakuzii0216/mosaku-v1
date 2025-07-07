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

  async findAll(supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.memo.findMany({
      where: { userId: user.id },
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

    return this.prisma.memo.create({
      data: {
        ...createMemoDto,
        userId: user.id,
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

  async search(query: string, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!query) {
      return this.findAll(supabaseUserId);
    }

    return this.prisma.memo.findMany({
      where: {
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
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }
}
