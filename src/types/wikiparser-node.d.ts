import RealParser from 'wikiparser-node/dist/index.js';

declare const Parser: typeof RealParser;

declare namespace Parser {
    export type LinkToken = import('wikiparser-node/dist/internal').LinkToken;
    export type TranscludeToken = import('wikiparser-node/dist/internal').TranscludeToken;
    export type CategoryToken = import('wikiparser-node/dist/internal').CategoryToken;
    export type HeadingToken = import('wikiparser-node/dist/internal').HeadingToken;
    export type ExtToken = import('wikiparser-node/dist/internal').ExtToken;
    export type IncludeToken = import('wikiparser-node/dist/internal').IncludeToken;
    export type NoincludeToken = import('wikiparser-node/dist/internal').NoincludeToken;
}

export default Parser;
export { Parser };
export type {
    Config,
    ConfigData,
    LintConfig,
    LintError,
    TokenTypes,
    LanguageService,
    QuickFixData,
    Title,
    AST,
} from 'wikiparser-node/dist/index.js';
export type * from 'wikiparser-node/dist/internal';
export type { AstRange } from 'wikiparser-node/dist/lib/range';
