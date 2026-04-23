import { MediaWikiApi } from 'wiki-saikou';
import config from './config';

const zhapi = new MediaWikiApi({
    baseURL: config.zh.api,
    fexiosConfigs: {
        headers: { 'user-agent': config.useragent },
    },
});

const cmapi = new MediaWikiApi({
    baseURL: config.cm.api,
    fexiosConfigs: {
        headers: { 'user-agent': config.useragent },
    },
});

const vjpapi = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { 'user-agent': config.useragent },
    },
});

const uewapi = new MediaWikiApi({
    baseURL: config.uew.api,
    fexiosConfigs: {
        headers: {
            'user-agent': config.useragent,
            'saoutax-bot': config.uew.cf!,
        },
    },
});

const qwapi = new MediaWikiApi({
    baseURL: config.qw.api,
    fexiosConfigs: {
        headers: { 'user-agent': config.qw.useragent! },
    },
});

class Login {
    constructor(private api: MediaWikiApi) {}

    async login({ site, account }: SiteAccount) {
        let sitename: string;
        switch (site) {
            case 'zh':
                sitename = 'MoegirlPedia(zh)';
                break;
            case 'cm':
                sitename = 'MoegirlPedia(commons)';
                break;
            case 'vjp':
                sitename = 'Vocawiki';
                break;
            case 'uew':
                sitename = 'United Earth Wiki';
                break;
            case 'qw':
                sitename = 'QiuwenBaike';
                break;
        }

        const siteConfig = config[site];

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

export { cmapi, zhapi, vjpapi, uewapi, qwapi, Login };
