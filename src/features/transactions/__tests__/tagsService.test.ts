import {parseTagsInput} from '../services/tagsService';

describe('parseTagsInput', () => {
  it('splits on commas and trims whitespace', () => {
    expect(parseTagsInput('work, trip ,family')).toEqual([
      'work',
      'trip',
      'family',
    ]);
  });

  it('drops empty entries', () => {
    expect(parseTagsInput(' , work,, ,')).toEqual(['work']);
  });

  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(parseTagsInput('Work, work, WORK')).toEqual(['Work']);
  });

  it('collapses internal whitespace', () => {
    expect(parseTagsInput('new   phone')).toEqual(['new phone']);
  });

  it('caps the number of tags', () => {
    const input = Array.from({length: 15}, (_, i) => `tag${i}`).join(',');
    expect(parseTagsInput(input)).toHaveLength(10);
  });

  it('returns an empty list for blank input', () => {
    expect(parseTagsInput('')).toEqual([]);
    expect(parseTagsInput('   ')).toEqual([]);
  });
});
