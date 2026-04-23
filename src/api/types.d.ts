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
    elaina: Site;
}

interface SiteAccount {
    site: 'zh' | 'cm' | 'uew' | 'vjp' | 'qw' | 'elaina';
    account: 'main' | 'bot';
}
