import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { AssignTagsDto } from './dto/assign-tags.dto';

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.tag.findMany({
      where: { userId: user.id },
      orderBy: {
        name: 'asc',
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

    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.userId !== user.id) {
      throw new ForbiddenException('You can only access your own tags');
    }

    return tag;
  }

  async create(createTagDto: CreateTagDto, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.tag.create({
      data: {
        ...createTagDto,
        userId: user.id,
      },
    });
  }

  async update(id: string, updateTagDto: UpdateTagDto, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.userId !== user.id) {
      throw new ForbiddenException('You can only update your own tags');
    }

    return this.prisma.tag.update({
      where: { id },
      data: updateTagDto,
    });
  }

  async remove(id: string, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.userId !== user.id) {
      throw new ForbiddenException('You can only delete your own tags');
    }

    return this.prisma.tag.delete({
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

    return this.prisma.tag.findMany({
      where: {
        userId: user.id,
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async assignTagsToMemo(
    memoId: string,
    assignTagsDto: AssignTagsDto,
    supabaseUserId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify memo ownership
    const memo = await this.prisma.memo.findUnique({
      where: { id: memoId },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${memoId} not found`);
    }

    if (memo.userId !== user.id) {
      throw new ForbiddenException('You can only modify your own memos');
    }

    // Verify all tags belong to the user
    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: assignTagsDto.tagIds },
        userId: user.id,
      },
    });

    if (tags.length !== assignTagsDto.tagIds.length) {
      throw new ForbiddenException('Some tags do not belong to you');
    }

    // Remove existing tags and add new ones
    await this.prisma.memoTag.deleteMany({
      where: { memoId },
    });

    if (assignTagsDto.tagIds.length > 0) {
      await this.prisma.memoTag.createMany({
        data: assignTagsDto.tagIds.map((tagId) => ({
          memoId,
          tagId,
        })),
      });
    }

    return this.prisma.memo.findUnique({
      where: { id: memoId },
      include: {
        memoTags: {
          include: {
            tag: true,
          },
        },
      },
    });
  }

  async getMemoTags(memoId: string, supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify memo ownership
    const memo = await this.prisma.memo.findUnique({
      where: { id: memoId },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${memoId} not found`);
    }

    if (memo.userId !== user.id) {
      throw new ForbiddenException('You can only access your own memos');
    }

    return this.prisma.memoTag.findMany({
      where: { memoId },
      include: {
        tag: true,
      },
    });
  }
}
