import type { MediaWikiApi } from 'wiki-saikou';
import { BatchQuery } from './batchQuery';
import { CheckGlobalUsage } from './checkGlobalUsage';
import { CheckRedirect } from './checkRedirects';
import { FlagDelete } from './flagDelete';
import { GetContent } from './getContent';
import { GetEmbedded } from './getEmbedded';
import { GetJSON } from './getJson';
import { GetLinked } from './getLinked';
import { QueryCategory } from './queryCategory';

class BotInstance {
    checkGlobalUsage: CheckGlobalUsage['check'];
    checkRedirect: CheckRedirect['check'];
    getContent: GetContent['get'];
    getJson: GetJSON['get'];
    getEmbedded: GetEmbedded['get'];
    getLinked: GetLinked['get'];
    batchQuery: BatchQuery['query'];
    flagDelete: FlagDelete['del'];
    queryCategory: QueryCategory['query'];

    constructor(api: MediaWikiApi) {
        this.flagDelete = new FlagDelete(api).del;
        this.checkRedirect = new CheckRedirect(api).check;
        this.batchQuery = new BatchQuery(api).query;
        this.checkGlobalUsage = new CheckGlobalUsage(api).check;
        this.getContent = new GetContent(api).get;
        this.getJson = new GetJSON(api).get;
        this.getEmbedded = new GetEmbedded(api).get;
        this.getLinked = new GetLinked(api).get;
        this.queryCategory = new QueryCategory(api).query;
    }
}

export { BotInstance };
