import 'dotenv/config';

const env = process.env;

const config = {
    useragent: `${env.API_USER_AGENT} (Github Actions; Saoutax-bot) `,
    zh: {
        api: 'https://mzh.moegirl.org.cn/api.php',
        accounts: {
            bot: {
                name: '机娘亚衣琴@saoutaxbot',
                password: env.ZH_BOT,
            },
            main: {
                name: 'SaoMikoto@SaoMikoto',
                password: env.ZH_MAIN,
            },
        },
    },
    cm: {
        api: 'https://commons.moegirl.org.cn/api.php',
        accounts: {
            bot: {
                name: '机娘亚衣琴@saoutaxbot',
                password: env.CM_BOT,
            },
            main: {
                name: 'SaoMikoto@saomikoto',
                password: env.CM_MAIN,
            },
        },
    },
    vjp: {
        api: 'https://voca.wiki/api.php',
        accounts: {
            bot: {
                name: 'MisakaNetwork@MisakaNetwork',
                password: env.VJP_BOT,
            },
            main: {
                name: 'SaoMikoto@saomikoto',
                password: env.VJP_MAIN,
            },
        },
    },
    uew: {
        api: 'https://unitedearth.wiki/api.php',
        cf: env.UEW_CF,
        accounts: {
            bot: {
                name: 'Saoutax-bot@saoutaxbot',
                password: env.UEW_BOT,
            },
            main: {
                name: 'SaoMikoto@SaoMikoto',
                password: env.UEW_MAIN,
            },
        },
    },
    qw: {
        api: 'https://www.qiuwenbaike.cn/api.php',
        useragent: `${env.API_USER_AGENT} (Github Actions; Saoutax-bot; Qiuwen/1.1)`,
        accounts: {
            main: {
                name: 'SaoMikoto@SaoMikoto',
                password: env.QW_MAIN,
            },
        },
    },
    elaina: {
        api: 'https://elaina.miraheze.org/w/api.php',
        accounts: {
            bot: {
                name: 'MisakaNetwork@MisakaNetwork',
                password: env.MH_BOT,
            },
            main: {
                name: 'Saoutax@Saoutax',
                password: env.MH_MAIN,
            },
        },
    },
};

export default config as Config;
