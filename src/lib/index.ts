import type { MediaWikiApi } from 'wiki-saikou';
import { BatchQuery } from './batchQuery';
import { CheckExist } from './checkExist';
import { CheckGlobalUsage } from './checkGlobalUsage';
import { CheckRedirects } from './checkRedirects';
import { EditPage } from './edit';
import { FlagDelete } from './flagDelete';
import { GetContent } from './getContent';
import { GetEmbedded } from './getEmbedded';
import { GetJson } from './getJson';
import { GetLinked } from './getLinked';
import { QueryCategory } from './queryCategory';

class BotInstance {
    #api: MediaWikiApi;

    #batchQuery?: BatchQuery;
    #checkExist?: CheckExist;
    #checkGlobalUsage?: CheckGlobalUsage;
    #checkRedirect?: CheckRedirects;
    #edit?: EditPage;
    #flagDelete?: FlagDelete;
    #getContent?: GetContent;
    #getEmbedded?: GetEmbedded;
    #getJson?: GetJson;
    #getLinked?: GetLinked;
    #queryCategory?: QueryCategory;

    constructor(api: MediaWikiApi) {
        this.#api = api;
    }

    get batchQuery(): BatchQuery['query'] {
        return (this.#batchQuery ??= new BatchQuery(this.#api)).query;
    }

    get checkExist(): CheckExist['check'] {
        return (this.#checkExist ??= new CheckExist(this.#api)).check;
    }

    get checkGlobalUsage(): CheckGlobalUsage['check'] {
        return (this.#checkGlobalUsage ??= new CheckGlobalUsage(this.#api)).check;
    }

    get checkRedirect(): CheckRedirects['check'] {
        return (this.#checkRedirect ??= new CheckRedirects(this.#api)).check;
    }

    get edit(): EditPage['edit'] {
        return (this.#edit ??= new EditPage(this.#api)).edit;
    }

    get flagDelete(): FlagDelete['del'] {
        return (this.#flagDelete ??= new FlagDelete(this.#api)).del;
    }

    get getContent(): GetContent['get'] {
        return (this.#getContent ??= new GetContent(this.#api)).get;
    }

    get getEmbedded(): GetEmbedded['get'] {
        return (this.#getEmbedded ??= new GetEmbedded(this.#api)).get;
    }

    get getJson(): GetJson['get'] {
        return (this.#getJson ??= new GetJson(this.#api)).get;
    }

    get getLinked(): GetLinked['get'] {
        return (this.#getLinked ??= new GetLinked(this.#api)).get;
    }

    get queryCategory(): QueryCategory['query'] {
        return (this.#queryCategory ??= new QueryCategory(this.#api)).query;
    }
}

export { BotInstance };
export type { PageContent } from './types';
