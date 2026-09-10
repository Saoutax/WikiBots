import Parser, { type LinkToken, type TranscludeToken } from 'wikiparser-node';
import { zhapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';

interface Config {
    target: string;
    sectiontitle: string;
    pretext: string;
    summary: string;
}

const bot = new BotInstance(api);

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const { target, sectiontitle, pretext, summary } = await bot.getJson<Config>(
        'User:SaoMikoto/Bot/config/monthly.json',
    );

    const content = await bot.getContent('萌娘百科:萌娘百科月报/订阅');

    const root = Parser.parse(content),
        links = root.querySelectorAll<LinkToken>('list + link');

    const targets = [
        ...new Set(links.map(item => item.name).filter(name => name.startsWith('User_talk:'))),
    ];

    const monthly =
        '{{subst:User:SaoMikoto/Bot/config/monthly}}<span style="display:none">~~~~</span>';

    console.log('Start delivery.');
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
    console.log('Delivery successful.');

    console.log('Start editing the current monthly.');
    const mptarget = '萌娘百科:萌娘百科月报';
    const mproot = Parser.parse(await bot.getContent(mptarget));
    const template = mproot.querySelector<TranscludeToken>('template:has(+comment)');
    template?.replaceTemplate(target);

    await api.postWithToken('csrf', {
        action: 'edit',
        title: mptarget,
        text: mproot.toString(),
        summary: '更新当期月报',
        bot: true,
        minor: true,
        tag: 'Bot',
    });

    console.log(`End time: ${new Date().toISOString()}`);
})();
