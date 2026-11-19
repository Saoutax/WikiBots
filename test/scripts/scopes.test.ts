import { describe, expect, it } from 'vitest';
import { isSourceFile, resolvePrefix, scopesChanged } from '../../scripts/lib/scopes';

describe('resolvePrefix', () => {
    it('keeps lowercase for direct children of src/lib, src/utils and src/api', () => {
        expect(resolvePrefix(['lib'])).toBe('lib');
        expect(resolvePrefix(['api'])).toBe('api');
    });

    it('uppercases site directories under src/bot', () => {
        expect(resolvePrefix(['bot', 'mgp'])).toBe('MGP');
    });

    it('keeps lowercase for src/bot/modules', () => {
        expect(resolvePrefix(['bot', 'modules'])).toBe('modules');
    });

    it('returns null for empty, nested or unsupported segments', () => {
        expect(resolvePrefix([])).toBeNull();
        expect(resolvePrefix(['lib', 'x'])).toBeNull();
        expect(resolvePrefix(['bot'])).toBeNull();
        expect(resolvePrefix(['bot', 'mgp', 'x'])).toBeNull();
        expect(resolvePrefix(['unknown'])).toBeNull();
    });
});

describe('isSourceFile', () => {
    it('accepts plain .ts files', () => {
        expect(isSourceFile('a.ts')).toBe(true);
        expect(isSourceFile('getJson.ts')).toBe(true);
    });

    it('rejects declaration files and other extensions', () => {
        expect(isSourceFile('a.d.ts')).toBe(false);
        expect(isSourceFile('a.js')).toBe(false);
        expect(isSourceFile('a.tsx')).toBe(false);
    });
});

describe('scopesChanged', () => {
    it('returns false when both scope lists are equal', () => {
        expect(scopesChanged(['MGP/a', 'lib/b'], ['MGP/a', 'lib/b'])).toBe(false);
        expect(scopesChanged([], [])).toBe(false);
    });

    it('returns true when the lengths differ', () => {
        expect(scopesChanged(['MGP/a'], ['MGP/a', 'lib/b'])).toBe(true);
    });

    it('returns true when an element differs', () => {
        expect(scopesChanged(['MGP/a', 'lib/b'], ['MGP/a', 'lib/c'])).toBe(true);
    });

    it('returns true when the old scopes are not an array', () => {
        const oldScopes = 'not-an-array' as unknown as string[];

        expect(scopesChanged(oldScopes, [])).toBe(true);
    });
});
