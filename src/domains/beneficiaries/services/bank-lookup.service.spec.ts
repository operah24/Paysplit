import { HttpException } from '@nestjs/common';
import { BankLookupService, BANK_ERROR_CODES } from './bank-lookup.service';
import { HepaidService } from '../../../integration/hepaid/hepaid.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return {
      status: (error as HttpException).getStatus(),
      code: ((error as HttpException).getResponse() as { code: string }).code,
    };
  }
  throw new Error('expected rejection');
};

describe('BankLookupService', () => {
  let hepaid: { listBanks: jest.Mock; resolveAccount: jest.Mock };
  let service: BankLookupService;

  beforeEach(() => {
    hepaid = {
      listBanks: jest.fn().mockResolvedValue([{ code: '058', name: 'GTBank' }]),
      resolveAccount: jest.fn().mockResolvedValue({
        bankCode: '058',
        accountNumber: '0123456789',
        accountName: ' ALI DABBS ',
        bankName: null,
      }),
    };
    service = new BankLookupService(hepaid as unknown as HepaidService);
  });

  it('resolves the name, fills the bank name from the list and caches the result', async () => {
    const first = await service.resolve('058', '0123456789');
    const second = await service.resolve('058', '0123456789');

    expect(first).toEqual({
      bankCode: '058',
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'ALI DABBS',
    });
    expect(second).toBe(first);
    expect(hepaid.resolveAccount).toHaveBeenCalledTimes(1);
  });

  it('rejects a bank that is not in the list without calling name enquiry', async () => {
    expect(await codeOf(service.resolve('999', '0123456789'))).toEqual({
      status: 422,
      code: BANK_ERROR_CODES.UNKNOWN_BANK,
    });
    expect(hepaid.resolveAccount).not.toHaveBeenCalled();
  });

  it('maps invalid_recipient to ACCOUNT_NOT_FOUND', async () => {
    hepaid.resolveAccount.mockRejectedValue(new HepaidError(422, 'invalid_recipient', 'Invalid'));
    expect(await codeOf(service.resolve('058', '0000000000'))).toEqual({
      status: 422,
      code: BANK_ERROR_CODES.ACCOUNT_NOT_FOUND,
    });
  });

  it('maps outages to BANK_LOOKUP_UNAVAILABLE', async () => {
    hepaid.listBanks.mockRejectedValue(new HepaidError(0, 'network_error', 'timed out'));
    expect(await codeOf(service.listBanks())).toEqual({
      status: 503,
      code: BANK_ERROR_CODES.BANK_LOOKUP_UNAVAILABLE,
    });
  });
});
