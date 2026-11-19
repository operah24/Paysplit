import { Table, Column, DataType } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';

@Table({ tableName: 'categories' })
export class Category extends BaseEntity<Category> {
  @Column({ type: DataType.STRING(60), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(60), allowNull: false, unique: true })
  declare slug: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_selectable' })
  declare isSelectable: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' })
  declare sortOrder: number;
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
}

export function toCategoryView(category: Category | null | undefined): CategoryView | null {
  return category ? { id: category.id, name: category.name, slug: category.slug } : null;
}
