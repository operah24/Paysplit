import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UserRepository } from './repository/user.repository';
import { RoleRepository } from './repository/role.repository';
import { SetupProgressRepository } from './repository/setup-progress.repository';
import { UsersService } from './services/users.service';

@Module({
  imports: [SequelizeModule.forFeature([User, Role])],
  providers: [UserRepository, RoleRepository, SetupProgressRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
