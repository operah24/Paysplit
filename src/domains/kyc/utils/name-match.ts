export interface NameMatchResult {
  score: number;
  firstNameScore: number;
  lastNameScore: number;
}

export function normaliseName(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length > 0);
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(a: string, b: string): number {
  if (a === b) return 100;
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : Math.round((1 - levenshtein(a, b) / longest) * 100);
}

function bestScore(name: string[], candidates: string[]): number {
  if (name.length === 0 || candidates.length === 0) return 0;
  let best = 0;
  for (const token of name) {
    for (const candidate of candidates) best = Math.max(best, similarity(token, candidate));
  }
  return best;
}

export function matchNames(
  provided: { firstName: string; lastName: string },
  record: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
  },
): NameMatchResult {
  const candidates = [
    ...normaliseName(record.firstName),
    ...normaliseName(record.middleName),
    ...normaliseName(record.lastName),
    ...normaliseName(record.fullName),
  ];
  const firstNameScore = bestScore(normaliseName(provided.firstName), candidates);
  const lastNameScore = bestScore(normaliseName(provided.lastName), candidates);
  return { score: Math.min(firstNameScore, lastNameScore), firstNameScore, lastNameScore };
}
