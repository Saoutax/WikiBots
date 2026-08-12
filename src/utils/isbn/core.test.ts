import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    canonicalIsbn10,
    ISBNError,
    isbnEquivalenceKey,
    isValidIsbn10,
    isValidIsbn13,
    loadGroups,
    normalise,
    normaliseToken,
    parseRangeMessageXml,
} from './core';

const XML_PATH = fileURLToPath(new URL('../../../data/RangeMessage.xml', import.meta.url));

describe('parseRangeMessageXml', () => {
    const groups = parseRangeMessageXml(readFileSync(XML_PATH, 'utf8'));

    it('parses non-empty groups from the real RangeMessage.xml', () => {
        expect(groups.length).toBeGreaterThan(0);
    });

    it('loadGroups matches parseRangeMessageXml', async () => {
        expect((await loadGroups(XML_PATH)).length).toBe(groups.length);
    });

    it('sorts groups by group length descending', () => {
        for (let i = 1; i < groups.length; i++) {
            expect(groups[i - 1]!.group.length).toBeGreaterThanOrEqual(groups[i]!.group.length);
        }
    });

    it('recognises the README sample group 978-7', () => {
        expect(groups.some(g => g.gs1 === '978' && g.group === '7')).toBe(true);
    });
});

describe('core helpers', () => {
    it('canonicalIsbn10 keeps digits and X, uppercases', () => {
        expect(canonicalIsbn10('0-97522980x')).toBe('097522980X');
    });

    it('isbnEquivalenceKey builds a canonical ISBN-13 key', () => {
        expect(isbnEquivalenceKey('0-306-40615-2')).toBe('9780306406157');
        expect(isbnEquivalenceKey('9780306406157')).toBe('9780306406157');
        expect(isbnEquivalenceKey('not-an-isbn')).toBeNull();
    });

    it('isValidIsbn13 accepts valid and rejects invalid', () => {
        expect(isValidIsbn13('9780306406157')).toBe(true);
        expect(isValidIsbn13('9787302511624')).toBe(false);
    });

    it('isValidIsbn10 accepts valid (incl. X) and rejects invalid', () => {
        expect(isValidIsbn10('097522980X')).toBe(true);
        expect(isValidIsbn10('0306406153')).toBe(false);
    });
});

describe('normaliseToken', () => {
    const groups = parseRangeMessageXml(readFileSync(XML_PATH, 'utf8'));

    it('hyphenates the README sample ISBN-13', () => {
        expect(normaliseToken('9787302511625', groups, false)).toBe('978-7-302-51162-5');
    });

    it('converts ISBN-10 to ISBN-13 when requested', () => {
        expect(normaliseToken('0306406152', groups, true)).toBe('978-0-306-40615-7');
    });

    it('keeps the X check digit in ISBN-10 output', () => {
        expect(normaliseToken('097522980X', groups, false)).toBe('0-9752298-0-X');
    });

    it('converts an ISBN-10 ending in X to ISBN-13', () => {
        expect(normaliseToken('097522980X', groups, true)).toBe('978-0-9752298-0-4');
    });

    it('prefixes with label when withLabel is true', () => {
        expect(normaliseToken('9787302511625', groups, false, true)).toBe('ISBN 978-7-302-51162-5');
    });

    it('throws ISBNError on invalid ISBN-13 check digit', () => {
        expect(() => normaliseToken('9787302511624', groups, false)).toThrow(ISBNError);
    });

    it('throws ISBNError on invalid ISBN-10 check digit', () => {
        expect(() => normaliseToken('0306406153', groups, false)).toThrow(ISBNError);
    });

    it('throws ISBNError on a non-ISBN string', () => {
        expect(() => normaliseToken('hello world', groups, false)).toThrow(ISBNError);
    });
});

describe('normalise (async, via xmlPath)', () => {
    it('normalises and can prefix the label', async () => {
        expect(await normalise('9787302511625', XML_PATH, true)).toBe('ISBN 978-7-302-51162-5');
        expect(await normalise('9787302511625', XML_PATH, false)).toBe('978-7-302-51162-5');
    });
});
