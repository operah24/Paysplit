import { Column, DataType, Model } from 'sequelize-typescript';

interface MoneyColumnOptions {
  field: string;
  allowNull?: boolean;
  defaultValue?: number;
}

export function MoneyColumn(options: MoneyColumnOptions): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const key = propertyKey as string;
    (
      Column({
        type: DataType.BIGINT,
        field: options.field,
        allowNull: options.allowNull ?? false,
        ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
        get(this: Model) {
          const raw = this.getDataValue(key) as unknown;
          return raw === null || raw === undefined ? raw : Number(raw);
        },
      }) as PropertyDecorator
    )(target, key);
  };
}
