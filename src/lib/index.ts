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

    get batchQuery() {
        return (this.#batchQuery ??= new BatchQuery(this.#api)).query;
    }

    get checkExist() {
        return (this.#checkExist ??= new CheckExist(this.#api)).check;
    }

    get checkGlobalUsage() {
        return (this.#checkGlobalUsage ??= new CheckGlobalUsage(this.#api)).check;
    }

    get checkRedirect() {
        return (this.#checkRedirect ??= new CheckRedirects(this.#api)).check;
    }

    get edit() {
        return (this.#edit ??= new EditPage(this.#api)).edit;
    }

    get flagDelete() {
        return (this.#flagDelete ??= new FlagDelete(this.#api)).del;
    }

    get getContent() {
        return (this.#getContent ??= new GetContent(this.#api)).get;
    }

    get getEmbedded() {
        return (this.#getEmbedded ??= new GetEmbedded(this.#api)).get;
    }

    get getJson() {
        return (this.#getJson ??= new GetJson(this.#api)).get;
    }

    get getLinked() {
        return (this.#getLinked ??= new GetLinked(this.#api)).get;
    }

    get queryCategory() {
        return (this.#queryCategory ??= new QueryCategory(this.#api)).query;
    }
}

export { BotInstance };
export type { PageContent } from './types';
