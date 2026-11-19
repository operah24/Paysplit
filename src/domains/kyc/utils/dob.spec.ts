import { normaliseDob } from './dob';

describe('normaliseDob', () => {
  it.each([
    ['1990-01-31', '1990-01-31'],
    ['1990/1/31', '1990-01-31'],
    ['1990-01-31T00:00:00Z', '1990-01-31'],
    ['31-01-1990', '1990-01-31'],
    ['31/01/1990', '1990-01-31'],
    ['15-Apr-1985', '1985-04-15'],
    ['15 April 1985', '1985-04-15'],
  ])('reads %s', (input, expected) => {
    expect(normaliseDob(input)).toBe(expected);
  });

  it.each([null, undefined, '', 'unknown', '31-02-1990', '1990-13-01', '15-Foo-1985'])(
    'returns null for %p',
    (input) => {
      expect(normaliseDob(input)).toBeNull();
    },
  );
});
