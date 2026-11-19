import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Category, CategoryView, toCategoryView } from '../entities/category.entity';
import { AppError } from '../../../shared/utils/app-error.util';

export const CATEGORY_ERROR_CODES = {
  INVALID_CATEGORY: 'INVALID_CATEGORY',
} as const;

export const SALARY_CATEGORY_SLUG = 'salary';

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category) private readonly model: typeof Category) {}

  async listSelectable(): Promise<CategoryView[]> {
    const rows = await this.model.findAll({
      where: { isSelectable: true },
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return rows.map((row) => toCategoryView(row)!);
  }

  async getSelectableOrThrow(id: string): Promise<Category> {
    const category = await this.model.findByPk(id);
    if (!category || !category.isSelectable) {
      throw AppError.unprocessable(
        CATEGORY_ERROR_CODES.INVALID_CATEGORY,
        'Choose a category from the list.',
      );
    }
    return category;
  }

  findBySlug(slug: string): Promise<Category | null> {
    return this.model.findOne({ where: { slug } });
  }
}
