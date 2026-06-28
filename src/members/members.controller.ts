import { Controller, Post, Body } from '@nestjs/common';
import { MembersService } from './members.service';
import { RegisterMemberDto } from './dto/register-member.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('members')
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterMemberDto) {
    return this.membersService.register(dto);
  }
}
