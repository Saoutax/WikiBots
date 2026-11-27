import type { MediaWikiApi } from 'wiki-saikou';
import { EditOps } from './edit';
import { PageOps } from './page';
import { QueryOps } from './query';

class BotInstance {
    #api: MediaWikiApi;

    #query?: QueryOps;
    #page?: PageOps;
    #edit?: EditOps;

    constructor(api: MediaWikiApi) {
        this.#api = api;
    }

    get batchQuery(): QueryOps['batchQuery'] {
        return (this.#query ??= new QueryOps(this.#api)).batchQuery;
    }

    get checkExist(): PageOps['checkExist'] {
        return (this.#page ??= new PageOps(this.#api)).checkExist;
    }

    get checkGlobalUsage(): QueryOps['checkGlobalUsage'] {
        return (this.#query ??= new QueryOps(this.#api)).checkGlobalUsage;
    }

    get checkRedirect(): PageOps['checkRedirect'] {
        return (this.#page ??= new PageOps(this.#api)).checkRedirect;
    }

    get edit(): EditOps['edit'] {
        return (this.#edit ??= new EditOps(this.#api)).edit;
    }

    get flagDelete(): EditOps['flagDelete'] {
        return (this.#edit ??= new EditOps(this.#api)).flagDelete;
    }

    get getContent(): PageOps['getContent'] {
        return (this.#page ??= new PageOps(this.#api)).getContent;
    }

    get getEmbedded(): QueryOps['getEmbedded'] {
        return (this.#query ??= new QueryOps(this.#api)).getEmbedded;
    }

    get getJson(): PageOps['getJson'] {
        return (this.#page ??= new PageOps(this.#api)).getJson;
    }

    get getLinked(): QueryOps['getLinked'] {
        return (this.#query ??= new QueryOps(this.#api)).getLinked;
    }

    get queryCategory(): QueryOps['queryCategory'] {
        return (this.#query ??= new QueryOps(this.#api)).queryCategory;
    }
}

export { BotInstance };
export { BaseApi } from './base';
export { formatNamespace } from './formatNamespace';
export { collectRecentChanges } from './recentChanges';
export { splitAndJoin } from './splitAndJoin';
export type { PageContent } from './types';
