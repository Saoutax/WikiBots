import Parser from 'wikiparser-node';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';

interface Config {
    target: string;
    sectiontitle: string;
    pretext: string;
    summary: string;
}

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const { target, sectiontitle, pretext, summary } = await bot.getJson<Config>(
            'User:SaoMikoto/Bot/config/monthly.json',
        );

        const { content } = await bot.getContent('萌娘百科:萌娘百科月报/订阅');

        const root = Parser.parse(content),
            links = root.querySelectorAll<Parser.LinkToken>('list + link');

        const targets = [
            ...new Set(links.map(item => item.name).filter(name => name.startsWith('User_talk:'))),
        ];

        const monthly =
            '{{subst:User:SaoMikoto/Bot/config/monthly}}<span style="display:none">~~~~</span>';

        console.log('Start delivery.');
        for (const title of targets) {
            const user = title.match(/User_talk:([^/\]]+)(?:\/[^\]]*)?/)?.[1],
                text = `<span style="display:none">${user ? `{{@|${user}}}` : ''}${pretext}</span>${monthly}`;
            await bot.edit({
                title,
                section: 'new',
                sectiontitle,
                text,
                tags: 'Bot',
                summary,
            });
            console.log(`Done: ${title}`);
        }
        console.log('Delivery successful.');

        console.log('Start editing the current monthly.');
        const mptarget = '萌娘百科:萌娘百科月报';
        const { content: mpContent, revid } = await bot.getContent(mptarget);
        const mproot = Parser.parse(mpContent);
        const template = mproot.querySelector<Parser.TranscludeToken>('template:has(+comment)');
        template?.replaceTemplate(target);

        await bot.edit({
            title: mptarget,
            text: mproot.toString(),
            baserevid: revid,
            summary: '更新当期月报',
            tags: 'Bot',
        });
    });
})();
