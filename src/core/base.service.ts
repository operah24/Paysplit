import { ModelCtor } from 'sequelize-typescript';
import { Attributes, WhereOptions } from 'sequelize';
import { BaseEntity } from './base.entity';

type CreatableModel<T> = {
  create(data: object): Promise<T>;
};

export abstract class BaseService<T extends BaseEntity<T>> {
  constructor(protected readonly repository: ModelCtor<T>) {}

  findAll(): Promise<T[]> {
    return this.repository.findAll();
  }

  findOne(id: string): Promise<T | null> {
    return this.repository.findByPk(id);
  }

  create(data: Partial<Attributes<T>>): Promise<T> {
    return (this.repository as CreatableModel<T>).create(data);
  }

  update(id: string, data: Partial<Attributes<T>>): Promise<[number, T[]]> {
    const where = { id } as unknown as WhereOptions<Attributes<T>>;
    return this.repository.update(data, { where, returning: true });
  }

  remove(id: string): Promise<number> {
    const where = { id } as unknown as WhereOptions<Attributes<T>>;
    return this.repository.destroy({ where });
  }
}
