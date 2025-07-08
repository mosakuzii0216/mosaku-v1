import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );
  }

  async verifyToken(token: string) {
    try {
      const { data, error } = await this.supabase.auth.getUser(token);

      if (error) {
        throw new Error(error.message);
      }

      return data.user;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
}
