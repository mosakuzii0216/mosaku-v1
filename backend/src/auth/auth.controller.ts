import { Controller, Post, Body, Get, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseGuard } from './supabase.guard';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('sync-user')
  @UseGuards(SupabaseGuard)
  async syncUser(@Request() req, @Body() createUserDto: CreateUserDto) {
    const supabaseUser = req.user;
    
    const existingUser = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id }
    });

    if (existingUser) {
      return existingUser;
    }

    const newUser = await this.prisma.user.create({
      data: {
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        name: createUserDto.name || supabaseUser.user_metadata?.full_name || supabaseUser.email,
        role: 'FREE'
      }
    });

    return newUser;
  }

  @Get('me')
  @UseGuards(SupabaseGuard)
  async getMe(@Request() req) {
    const supabaseUser = req.user;
    
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id }
    });

    if (!user) {
      throw new NotFoundException('User not found. Please sync your account first.');
    }

    return user;
  }
}