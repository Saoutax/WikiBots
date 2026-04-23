interface Site {
    api: string;
    accounts: {
        [account: string]: {
            name: string;
            password: string;
        };
    };
    cf?: string;
    useragent?: string;
}

interface Config {
    useragent: string;
    zh: Site;
    cm: Site;
    vjp: Site;
    uew: Site;
    qw: Site;
}

interface SiteAccount {
    site: 'zh' | 'cm' | 'uew' | 'vjp' | 'qw';
    account: 'main' | 'bot';
}
