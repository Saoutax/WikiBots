import type { MediaWikiApi } from 'wiki-saikou';
import { BatchQuery } from './batchQuery';
import { CheckExist } from './checkExist';
import { CheckGlobalUsage } from './checkGlobalUsage';
import { CheckRedirect } from './checkRedirects';
import { FlagDelete } from './flagDelete';
import { GetContent } from './getContent';
import { GetEmbedded } from './getEmbedded';
import { GetJSON } from './getJson';
import { GetLinked } from './getLinked';
import { QueryCategory } from './queryCategory';

class BotInstance {
    batchQuery: BatchQuery['query'];
    checkExist: CheckExist['check'];
    checkGlobalUsage: CheckGlobalUsage['check'];
    checkRedirect: CheckRedirect['check'];
    flagDelete: FlagDelete['del'];
    getContent: GetContent['get'];
    getEmbedded: GetEmbedded['get'];
    getJson: GetJSON['get'];
    getLinked: GetLinked['get'];
    queryCategory: QueryCategory['query'];

    constructor(api: MediaWikiApi) {
        this.batchQuery = new BatchQuery(api).query;
        this.checkExist = new CheckExist(api).check;
        this.checkGlobalUsage = new CheckGlobalUsage(api).check;
        this.checkRedirect = new CheckRedirect(api).check;
        this.flagDelete = new FlagDelete(api).del;
        this.getContent = new GetContent(api).get;
        this.getEmbedded = new GetEmbedded(api).get;
        this.getJson = new GetJSON(api).get;
        this.getLinked = new GetLinked(api).get;
        this.queryCategory = new QueryCategory(api).query;
    }
}

export { BotInstance };
