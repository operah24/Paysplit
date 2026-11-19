import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

export interface SetupProgressFlags {
  hasIncome: boolean;
  hasWallet: boolean;
  hasBeneficiary: boolean;
  hasSplitRule: boolean;
}

export const EMPTY_SETUP_PROGRESS: SetupProgressFlags = {
  hasIncome: false,
  hasWallet: false,
  hasBeneficiary: false,
  hasSplitRule: false,
};

@Injectable()
export class SetupProgressRepository {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  async getFlags(userId: string): Promise<SetupProgressFlags> {
    const [row] = await this.sequelize.query<SetupProgressFlags>(
      `SELECT
         EXISTS (SELECT 1 FROM salary_profiles WHERE user_id = :userId AND deleted_at IS NULL) AS "hasIncome",
         EXISTS (SELECT 1 FROM wallets         WHERE user_id = :userId AND deleted_at IS NULL) AS "hasWallet",
         EXISTS (SELECT 1 FROM beneficiaries   WHERE user_id = :userId AND deleted_at IS NULL) AS "hasBeneficiary",
         EXISTS (SELECT 1 FROM split_rules     WHERE user_id = :userId AND deleted_at IS NULL) AS "hasSplitRule"`,
      { type: QueryTypes.SELECT, replacements: { userId } },
    );
    return row ?? EMPTY_SETUP_PROGRESS;
  }
}
