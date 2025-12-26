import { MediaWikiApi } from "wiki-saikou";
import config from "./config.js";

export const zhapi = new MediaWikiApi({
    baseURL: config.zh.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    },
});

export const cmapi = new MediaWikiApi({
    baseURL: config.cm.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    },
});

export const vjpapi = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    },
});

export const uewapi = new MediaWikiApi({
    baseURL: config.uew.api,
    fexiosConfigs: {
        headers: {
            "user-agent": config.useragent,
            "saoutax-bot": config.uew.cf,
        },
    },
});

export function getPaths(str) {
    const path = str.split(".");
    const result = {
        site: path[0],
        account: path[1],
    };
    return result;
}

export class Login {
    constructor(api) {
        this.api = api;
    }

    async login(paths) {
        const path = getPaths(paths);

        let sitename;
        switch (path.site) {
            case "zh":
                sitename = "MoegirlPedia(zh)";
                break;
            case "cm":
                sitename = "MoegirlPedia(commons)";
                break;
            case "vjp":
                sitename = "Vocawiki";
                break;
            case "uew":
                sitename = "United Earth Wiki";
                break;
        }

        return await this.api
            .login(
                config[path.site][path.account].name,
                config[path.site][path.account].password,
                undefined,
                {
                    retry: 25,
                    noCache: true,
                },
            )
            .then(res => {
                console.log(`Successfully logged in to ${sitename} as Uesr:${res.lgusername}.`);
                return res;
            });
    }
}
