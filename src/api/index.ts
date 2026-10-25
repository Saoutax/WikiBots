import { MediaWikiApi } from 'wiki-saikou';
import config from './config';
import type { SiteAccount } from './types';

/**
 * 按站点创建 MediaWikiApi 实例
 *
 * 站点差异（专属 user-agent、附加请求头）统一由 config 字段声明。
 *
 * @param site - 站点标识
 * @returns MediaWikiApi 实例
 */
const createApi = (site: SiteAccount['site']) => {
    const { api, cf, useragent } = config[site];
    return new MediaWikiApi({
        baseURL: api,
        fexiosConfigs: {
            headers: {
                'user-agent': useragent ?? config.useragent,
                ...(cf !== undefined ? { 'saoutax-bot': cf } : {}),
            },
        },
    });
};

const zhapi = createApi('zh'),
    cmapi = createApi('cm'),
    vjpapi = createApi('vjp'),
    uewapi = createApi('uew'),
    qwapi = createApi('qw'),
    elainaapi = createApi('elaina'),
    sapapi = createApi('sap');

const SITE_NAMES: Record<SiteAccount['site'], string> = {
    zh: 'MoegirlPedia(zh)',
    cm: 'MoegirlPedia(commons)',
    vjp: 'Vocawiki',
    uew: 'United Earth Wiki',
    qw: 'QiuwenBaike',
    elaina: 'ElainaWiki',
    sap: 'SAPedia',
};

class Login {
    constructor(private api: MediaWikiApi) {}

    async login({ site, account }: SiteAccount) {
        const sitename = SITE_NAMES[site],
            siteConfig = config[site];

        if (!siteConfig.accounts[account]) {
            throw new Error(`Invalid account: ${account}`);
        }

        return await this.api
            .login(
                siteConfig.accounts[account].name,
                siteConfig.accounts[account].password,
                undefined,
                { retry: 25, noCache: true },
            )
            .then(res => {
                console.log(`Successfully logged in to ${sitename} as User:${res.lgusername}.`);
                return res;
            });
    }
}

export { cmapi, zhapi, vjpapi, uewapi, qwapi, elainaapi, sapapi, Login };
export { run } from './run';
