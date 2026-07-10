import Parser, { type TranscludeToken } from 'wikiparser-node';
import { qwapi as api, Login } from '@/api';
import data from '@/config/status_data.json';
import { BotInstance } from '@/lib';
import { dayjs, getLatestTimestamp } from '@/utils';

const bot = new BotInstance(api);

interface RFRResult {
    preface: string;
    sections: string[];
}

const parseRFRRequests = (wikitext: string): RFRResult => {
    const root = Parser.parse(wikitext);
    const h4Headings = root.querySelectorAll('heading').filter(h => h.level === 4);

    if (h4Headings.length === 0) {
        return { preface: wikitext, sections: [] };
    }

    const firstH4Index = h4Headings[0]!.getAbsoluteIndex();

    return {
        preface: wikitext.slice(0, firstH4Index),
        sections: h4Headings
            .map(h => {
                const sec = h.section();
                return sec ? wikitext.slice(sec.startIndex, sec.endIndex) : '';
            })
            .filter(Boolean),
    };
};

const main = async (targets: string[]) => {
    const allowList = [
        ...new Set([
            ...data.done.status,
            ...data.nd.status,
            ...data.wd.status,
            ...data.ad.status,
            ...data.rd.status,
        ]),
    ];
    const currentTime = dayjs().tz();

    await Promise.allSettled(
        targets.map(async target => {
            try {
                const parsed = parseRFRRequests(await bot.getContent(target));
                const archiveArr: string[] = [];

                const remaining = parsed.sections.filter(section => {
                    const root = Parser.parse(section),
                        template = root.querySelector<TranscludeToken>('template#Template:Status')!,
                        status = template.getValue('1');
                    if (
                        status &&
                        allowList.includes(status) &&
                        dayjs(currentTime).diff(getLatestTimestamp(section), 'day') >= 3
                    ) {
                        archiveArr.push(section);
                        return false;
                    }
                    return true;
                });

                if (archiveArr.length > 0) {
                    const discussion = `${parsed.preface}\n` + remaining.join('');
                    const archive = archiveArr.join('');

                    const archiveTitle = `${target}/存档/${currentTime.format('YYYY年')}`;
                    const append = await bot.checkExist(archiveTitle);
                    const params = {
                        action: 'edit',
                        summary: '机器人：存档讨论',
                        minor: true,
                        bot: true,
                    };
                    await Promise.all([
                        api.postWithToken('csrf', {
                            ...params,
                            title: target,
                            text: discussion,
                        }),
                        api.postWithToken('csrf', {
                            ...params,
                            title: archiveTitle,
                            ...(append
                                ? { appendtext: `\n\n${archive}` }
                                : { text: `{{talkarchive}}\n\n${archive}` }),
                        }),
                    ]);
                    console.log(`Successfully archived ${archiveArr.length} threads in ${target}`);
                } else {
                    console.log(`No threads need to be archived in ${target}`);
                }
            } catch (e) {
                console.log(`Failed to archive ${target}: ${String(e)}`);
            }
        }),
    );
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    // 由于部分板块长期无使用，为减少不必要的请求而暂时禁用
    await main([
        'Qiuwen_talk:权限申请/申请巡查回退权',
        'Qiuwen_talk:权限申请/申请巡查豁免权',
        'Qiuwen_talk:权限申请/申请确认用户权',
        'Qiuwen_talk:权限申请/申请大量消息发送权',
        'Qiuwen_talk:权限申请/申请导入权',
        'Qiuwen_talk:权限申请/申请活动组织权',
        'Qiuwen_talk:权限申请/申请模板编辑权',
        'Qiuwen_talk:权限申请/申请机器人权限',
        'Qiuwen_talk:权限申请/申请IP封禁豁免权',
        // 'Qiuwen_talk:权限申请/申请手机号验证豁免',
        // 'Qiuwen_talk:权限解除/滥用权限',
        // 'Qiuwen_talk:权限解除/长期不活跃',
        // 'Qiuwen_talk:权限解除/解除机器人权限',
        // 'Qiuwen_talk:权限解除/自行除权',
        // 'Qiuwen_talk:权限解除/除权复核',
    ]);

    console.log(`End time: ${new Date().toISOString()}`);
})();
