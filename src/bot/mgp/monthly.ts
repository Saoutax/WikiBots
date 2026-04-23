import Parser, { type LinkToken } from 'wikiparser-node';
import { zhapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';

interface Config {
    sectiontitle: string;
    pretext: string;
    summary: string;
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const bot = new BotInstance(api);

    const { sectiontitle, pretext, summary } = (await bot.getJson(
        'User:SaoMikoto/Bot/config/monthly.json',
    )) as Config;

    const {
        data: {
            query: {
                pages: [
                    {
                        revisions: [{ content }],
                    },
                ],
            },
        },
    } = await api.post({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        titles: '萌娘百科:萌娘百科月报/订阅',
    });

    const root = Parser.parse(content),
        links = root.querySelectorAll<LinkToken>('list + link');

    const targets = [
        ...new Set(links.map(item => item.name).filter(name => name.startsWith('User_talk:'))),
    ];

    const monthly =
        '{{subst:User:SaoMikoto/Bot/config/monthly}}<span style="display:none">~~~~</span>';

    for (const title of targets) {
        const user = title.match(/User_talk:([^/\]]+)(?:\/[^\]]*)?/)?.[1],
            text = `<span style="display:none">${user ? `{{@|${user}}}` : ''}${pretext}</span>${monthly}`;
        await api.postWithToken('csrf', {
            action: 'edit',
            title,
            section: 'new',
            sectiontitle,
            text,
            tags: 'Bot',
            summary,
            watchlist: 'nochange',
            bot: true,
        });
        console.log(`Done: ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
