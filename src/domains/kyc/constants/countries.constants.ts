import { KycMethod, KycRegion, NIGERIA_METHODS } from './kyc.constants';

export interface SupportedCountry {
  code: string;
  name: string;
  dialCode: string;

  currency: string;
  region: KycRegion;

  methods: readonly KycMethod[];
}

export const SUPPORTED_COUNTRIES: readonly SupportedCountry[] = [
  {
    code: 'NG',
    name: 'Nigeria',
    dialCode: '+234',
    currency: 'NGN',
    region: 'nigeria',
    methods: NIGERIA_METHODS,
  },
];

export function findSupportedCountry(code?: string | null): SupportedCountry | undefined {
  if (!code) return undefined;
  return SUPPORTED_COUNTRIES.find((c) => c.code === code.toUpperCase());
}
