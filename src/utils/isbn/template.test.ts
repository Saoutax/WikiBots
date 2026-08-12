import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRangeMessageXml } from './core';
import { changeReportTotal, normaliseIsbnTemplatesWithGroups } from './template';

const XML_PATH = fileURLToPath(new URL('../../../data/RangeMessage.xml', import.meta.url));
const groups = parseRangeMessageXml(readFileSync(XML_PATH, 'utf8'));

describe('Cite book ISBN parameter', () => {
    const { text, report } = normaliseIsbnTemplatesWithGroups(
        '{{Cite book|ISBN=9787302511625}}',
        groups,
    );

    it('normalises the isbn param and lowercases its name', () => {
        expect(text).toBe('{{Cite book|isbn=978-7-302-51162-5}}');
    });

    it('counts one isbnNormalised change', () => {
        expect(report.isbnNormalised).toBe(1);
    });
});

describe('BookSource link replacement', () => {
    const { text, report } = normaliseIsbnTemplatesWithGroups(
        '[[Special:网络书源/9787302511625|ISBN 9787302511625]]',
        groups,
    );

    it('replaces the link with {{ISBN}} and drops the equal label', () => {
        expect(text).toBe('{{ISBN|978-7-302-51162-5}}');
    });

    it('counts the booksource link and the reformat', () => {
        expect(report.booksourceLinks).toBe(1);
        expect(report.isbnReformatted).toBe(1);
    });
});

describe('ISBNT merge with equal label', () => {
    const { text, report } = normaliseIsbnTemplatesWithGroups(
        '{{ISBN|9787302511625|9787302511625}}',
        groups,
        { rehyphenateEqualLabel: true },
    );

    it('merges into {{ISBNT}} with hyphenated param 1', () => {
        expect(text).toBe('{{ISBNT|978-7-302-51162-5}}');
    });

    it('counts one isbntMerged change', () => {
        expect(report.isbntMerged).toBe(1);
    });
});

describe('plain {{ISBN}} normalisation', () => {
    it('hyphenates param 1', () => {
        const { text, report } = normaliseIsbnTemplatesWithGroups('{{ISBN|9787302511625}}', groups);
        expect(text).toBe('{{ISBN|978-7-302-51162-5}}');
        expect(report.isbnNormalised).toBe(1);
    });

    it('leaves an already-correct template untouched', () => {
        const { text, report } = normaliseIsbnTemplatesWithGroups(
            '{{ISBN|978-7-302-51162-5}}',
            groups,
        );
        expect(text).toBe('{{ISBN|978-7-302-51162-5}}');
        expect(changeReportTotal(report)).toBe(0);
    });
});

describe('idempotency', () => {
    const cases = [
        '{{Cite book|isbn=978-7-302-51162-5}}',
        '{{ISBN|978-7-302-51162-5}}',
        '{{ISBNT|978-7-302-51162-5}}',
    ];

    it.each(cases)('running again on %s makes no further changes', input => {
        const { text, report } = normaliseIsbnTemplatesWithGroups(input, groups);
        expect(text).toBe(input);
        expect(changeReportTotal(report)).toBe(0);
    });
});
