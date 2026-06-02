import 'dotenv/config';

const env = (key: string) => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var: ${key}`);
    }
    return value;
};

/**
 * Lazy credential wrapper — password env var is only validated when actually
 * accessed, not at module load time. This lets each CI task only set the env
 * vars for the single site it runs.
 */
const cred = (name: string, key: string) => ({
    name,
    get password() {
        return env(key);
    },
});

const config = {
    useragent: `${env('API_USER_AGENT')} (Github Actions; Saoutax-bot) `,
    zh: {
        api: 'https://mzh.moegirl.org.cn/api.php',
        accounts: {
            bot: cred('机娘亚衣琴@saoutaxbot', 'ZH_BOT'),
            main: cred('SaoMikoto@SaoMikoto', 'ZH_MAIN'),
        },
    },
    cm: {
        api: 'https://commons.moegirl.org.cn/api.php',
        accounts: {
            bot: cred('机娘亚衣琴@saoutaxbot', 'CM_BOT'),
            main: cred('SaoMikoto@saomikoto', 'CM_MAIN'),
        },
    },
    vjp: {
        api: 'https://voca.wiki/api.php',
        accounts: {
            bot: cred('MisakaNetwork@MisakaNetwork', 'VJP_BOT'),
            main: cred('SaoMikoto@saomikoto', 'VJP_MAIN'),
        },
    },
    uew: {
        api: 'https://unitedearth.wiki/api.php',
        accounts: {
            bot: cred('Saoutax-bot@saoutaxbot', 'UEW_BOT'),
            main: cred('SaoMikoto@SaoMikoto', 'UEW_MAIN'),
        },
        get cf() {
            return env('UEW_CF');
        },
    },
    qw: {
        api: 'https://www.qiuwenbaike.cn/api.php',
        accounts: {
            bot: cred('Saoutax-bot@Saoutax-bot', 'QW_BOT'),
            main: cred('SaoMikoto@SaoMikoto', 'QW_MAIN'),
        },
        get useragent() {
            return `${env('API_USER_AGENT')} (Github Actions; Saoutax-bot; Qiuwen/1.1)`;
        },
    },
    elaina: {
        api: 'https://elaina.miraheze.org/w/api.php',
        accounts: {
            bot: cred('MisakaNetwork@MisakaNetwork', 'MH_BOT'),
            main: cred('Saoutax@Saoutax', 'MH_MAIN'),
        },
    },
};

export default config;
