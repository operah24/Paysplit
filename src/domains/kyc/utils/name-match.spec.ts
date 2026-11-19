import { matchNames, normaliseName } from './name-match';

describe('name matching', () => {
  it('normalises case, accents and punctuation', () => {
    expect(normaliseName("  ÀDÉ-Ọlá  O'Brien ")).toEqual(['ade', 'ola', 'o', 'brien']);
  });

  it('matches regardless of order and casing, using middle names as candidates', () => {
    const result = matchNames(
      { firstName: 'paul', lastName: 'OBI' },
      { firstName: 'Chukwuemeka', middleName: 'Paul', lastName: 'Obi' },
    );
    expect(result.score).toBe(100);
  });

  it('tolerates a small typo', () => {
    const result = matchNames(
      { firstName: 'Olumide', lastName: 'Adeyemi' },
      { firstName: 'Olumide', lastName: 'Adeyemmi' },
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('matches against a full-name field', () => {
    const result = matchNames(
      { firstName: 'Jane', lastName: 'Doe' },
      { fullName: 'DOE JANE MARY' },
    );
    expect(result.score).toBe(100);
  });

  it('scores a different person low', () => {
    const result = matchNames(
      { firstName: 'Paul', lastName: 'Obi' },
      { firstName: 'Fatima', lastName: 'Bello' },
    );
    expect(result.score).toBeLessThan(80);
  });

  it('scores 0 when the record has no name', () => {
    expect(matchNames({ firstName: 'Paul', lastName: 'Obi' }, {}).score).toBe(0);
  });
});
