import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../entities/role.entity';

@Injectable()
export class RoleRepository {
  constructor(
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
  ) {}

  findByName(name: string): Promise<Role | null> {
    return this.roleModel.findOne({ where: { name } });
  }

  findById(id: string): Promise<Role | null> {
    return this.roleModel.findByPk(id);
  }
}
