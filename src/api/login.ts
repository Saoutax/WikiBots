import type { MediaWikiApi } from 'wiki-saikou';
import config from './config';
import type { SiteAccount } from './types';

const SITE_NAMES: Record<SiteAccount['site'], string> = {
    zh: 'MoegirlPedia(zh)',
    cm: 'MoegirlPedia(commons)',
    vjp: 'Vocawiki',
    uew: 'United Earth Wiki',
    qw: 'QiuwenBaike',
    elaina: 'ElainaWiki',
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

export { Login };
