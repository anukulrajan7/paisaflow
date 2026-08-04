import {parseSummaryContent} from '../services/summarySchema';

const VALID = {
  headline: 'You spent ₹32,000 this month',
  overview: 'Spending is concentrated in food.',
  highlights: ['Food is your biggest category'],
  warnings: ['You are over budget'],
  suggestions: ['Set a budget'],
  comparison: 'Spending is up 28% vs last month.',
};

describe('parseSummaryContent', () => {
  it('parses clean strict JSON', () => {
    expect(parseSummaryContent(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('strips code fences', () => {
    const fenced = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseSummaryContent(fenced)).toEqual(VALID);
  });

  it('extracts the first {...} block from surrounding prose', () => {
    const wrapped = `Here is your summary:\n${JSON.stringify(
      VALID,
    )}\nHope that helps!`;
    expect(parseSummaryContent(wrapped)).toEqual(VALID);
  });

  it('ignores braces inside strings while extracting', () => {
    const tricky = {...VALID, overview: 'Use {curly} braces wisely.'};
    expect(parseSummaryContent(`Sure! ${JSON.stringify(tricky)}`)).toEqual(tricky);
  });

  it('fills defaults for missing optional arrays', () => {
    const minimal = {headline: 'Hi', overview: 'Some overview.'};
    expect(parseSummaryContent(JSON.stringify(minimal))).toEqual({
      headline: 'Hi',
      overview: 'Some overview.',
      highlights: [],
      warnings: [],
      suggestions: [],
      comparison: '',
    });
  });

  it('recovers when an array field has the wrong type', () => {
    const broken = {...VALID, highlights: 'not an array'};
    const parsed = parseSummaryContent(JSON.stringify(broken));
    expect(parsed).not.toBeNull();
    expect(parsed?.highlights).toEqual([]);
  });

  it('returns null for garbage', () => {
    expect(parseSummaryContent('not json at all')).toBeNull();
    expect(parseSummaryContent('{"headline": 42}')).toBeNull();
    expect(parseSummaryContent('')).toBeNull();
  });

  it('returns null when required strings are empty', () => {
    const empty = {...VALID, headline: '   '};
    expect(parseSummaryContent(JSON.stringify(empty))).toBeNull();
  });
});
