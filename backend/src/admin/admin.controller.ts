import { Body, Controller, Get, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@Roles('owner') // entire controller is owner-only
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.admin.createUser(dto);
  }

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }
}
