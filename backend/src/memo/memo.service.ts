import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { CreateMemoDto } from './dto/create-memo.dto';
import { UpdateMemoDto } from './dto/update-memo.dto';

@Injectable()
export class MemoService {
  private prisma = new PrismaClient();

  async findAll() {
    return this.prisma.memo.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const memo = await this.prisma.memo.findUnique({
      where: { id },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${id} not found`);
    }

    return memo;
  }

  async create(createMemoDto: CreateMemoDto) {
    return this.prisma.memo.create({
      data: createMemoDto,
    });
  }

  async update(id: string, updateMemoDto: UpdateMemoDto) {
    const memo = await this.prisma.memo.findUnique({
      where: { id },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${id} not found`);
    }

    return this.prisma.memo.update({
      where: { id },
      data: updateMemoDto,
    });
  }

  async remove(id: string) {
    const memo = await this.prisma.memo.findUnique({
      where: { id },
    });

    if (!memo) {
      throw new NotFoundException(`Memo with ID ${id} not found`);
    }

    return this.prisma.memo.delete({
      where: { id },
    });
  }

  async search(query: string) {
    if (!query) {
      return this.findAll();
    }

    return this.prisma.memo.findMany({
      where: {
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
