import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserDto } from './dto/create-user.dto';

/** User provisioning via Supabase Auth admin API + RBAC profile (§6.2). */
@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

  async createUser(dto: CreateUserDto) {
    const { data, error } = await this.supabase.client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new BadRequestException(error?.message ?? 'Failed to create user');
    }

    const { data: profile, error: pErr } = await this.supabase.client
      .from('profiles')
      .insert({
        id: data.user.id,
        full_name: dto.full_name,
        role: dto.role,
      })
      .select()
      .single();
    if (pErr) {
      // Roll back the auth user so we don't leave an orphan without a profile.
      await this.supabase.client.auth.admin.deleteUser(data.user.id);
      throw new InternalServerErrorException(pErr.message);
    }

    return { ...profile, email: data.user.email };
  }

  async listUsers() {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .order('created_at');
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
