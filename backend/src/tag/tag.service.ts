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

  async findAll(userId: string) {
    return this.prisma.tag.findMany({
      where: { userId },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string, userId: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.userId !== userId) {
      throw new ForbiddenException('You can only access your own tags');
    }

    return tag;
  }

  async create(createTagDto: CreateTagDto, userId: string) {
    return this.prisma.tag.create({
      data: {
        ...createTagDto,
        userId,
      },
    });
  }

  async update(id: string, updateTagDto: UpdateTagDto, userId: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.userId !== userId) {
      throw new ForbiddenException('You can only update your own tags');
    }

    return this.prisma.tag.update({
      where: { id },
      data: updateTagDto,
    });
  }

  async remove(id: string, userId: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    if (tag.userId !== userId) {
      throw new ForbiddenException('You can only delete your own tags');
    }

    return this.prisma.tag.delete({
      where: { id },
    });
  }

  async search(query: string, userId: string) {
    if (!query) {
      return this.findAll(userId);
    }

    return this.prisma.tag.findMany({
      where: {
        userId,
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
    userId: string,
  ) {
    // Verify memo ownership
    const memo = await this.prisma.memo.findUnique({
      where: { id: memoId },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${memoId} not found`);
    }

    if (memo.userId !== userId) {
      throw new ForbiddenException('You can only modify your own memos');
    }

    // Verify all tags belong to the user
    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: assignTagsDto.tagIds },
        userId,
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

  async getMemoTags(memoId: string, userId: string) {
    // Verify memo ownership
    const memo = await this.prisma.memo.findUnique({
      where: { id: memoId },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${memoId} not found`);
    }

    if (memo.userId !== userId) {
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
