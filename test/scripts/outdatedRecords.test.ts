import { describe, expect, it } from 'vitest';
import { dayjs } from '@/utils/time';
import { filterOutdatedRecords } from '../../scripts/lib/outdatedRecords';

/** Fixed reference time so the tests never depend on the clock. */
const now = dayjs('2024-01-20T00:00:00Z');

describe('filterOutdatedRecords', () => {
    it('keeps records within the default 14 day window', () => {
        const data = {
            '2024-01-15T00:00:00Z': ['a'],
            '2024-01-07T00:00:00Z': ['b'],
        };

        const { filtered, removed } = filterOutdatedRecords(data, now);

        expect(filtered).toEqual(data);
        expect(removed).toEqual([]);
    });

    it('removes a record exactly at the threshold because isAfter is strict', () => {
        const data = {
            '2024-01-06T00:00:00Z': ['a'],
            '2024-01-07T00:00:00Z': ['b'],
        };

        const { filtered, removed } = filterOutdatedRecords(data, now);

        expect(filtered).toEqual({ '2024-01-07T00:00:00Z': ['b'] });
        expect(removed).toEqual(['2024-01-06T00:00:00Z']);
    });

    it('removes records with an invalid timestamp', () => {
        const data = { 'not-a-date': ['a'] };

        const { filtered, removed } = filterOutdatedRecords(data, now);

        expect(filtered).toEqual({});
        expect(removed).toEqual(['not-a-date']);
    });

    it('preserves the original key order of kept records', () => {
        const data = {
            '2024-01-19T00:00:00Z': ['c'],
            '2024-01-10T00:00:00Z': ['a'],
            '2024-01-06T00:00:00Z': ['old'],
            '2024-01-18T00:00:00Z': ['b'],
        };

        const { filtered, removed } = filterOutdatedRecords(data, now);

        expect(Object.keys(filtered)).toEqual([
            '2024-01-19T00:00:00Z',
            '2024-01-10T00:00:00Z',
            '2024-01-18T00:00:00Z',
        ]);
        expect(removed).toEqual(['2024-01-06T00:00:00Z']);
    });

    it('keeps the removal order identical to the input order', () => {
        const data = {
            '2024-01-03T00:00:00Z': ['a'],
            '2024-01-15T00:00:00Z': ['keep'],
            '2024-01-05T00:00:00Z': ['b'],
            '2024-01-01T00:00:00Z': ['c'],
        };

        const { removed } = filterOutdatedRecords(data, now);

        expect(removed).toEqual([
            '2024-01-03T00:00:00Z',
            '2024-01-05T00:00:00Z',
            '2024-01-01T00:00:00Z',
        ]);
    });

    it('honors a custom day window', () => {
        const data = {
            '2024-01-15T00:00:00Z': ['fresh'],
            '2024-01-12T00:00:00Z': ['stale'],
            '2024-01-13T00:00:00Z': ['threshold'],
        };

        const { filtered, removed } = filterOutdatedRecords(data, now, 7);

        expect(Object.keys(filtered)).toEqual(['2024-01-15T00:00:00Z']);
        expect(removed).toEqual(['2024-01-12T00:00:00Z', '2024-01-13T00:00:00Z']);
    });
});
