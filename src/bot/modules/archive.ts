import type { MediaWikiApi } from 'wiki-saikou';
import { BotInstance } from '@/lib';

interface ArchiveParams {
    /** 讨论页标题 */
    target: string;
    /** 存档页标题 */
    archiveTitle: string;
    /** 讨论页保留的内容 */
    discussion: string;
    /** 需要存档的内容 */
    archive: string;
    /** 编辑摘要 */
    summary: string;
    /** 讨论页的基线版本号 */
    baserevid?: number;
}

/**
 * 将讨论内容存档：更新讨论页，并把过期内容写入存档页
 *
 * 存档页不存在时以 {{talkarchive}} 开头创建。
 *
 * @param api - MediaWikiApi 实例
 * @param params - 存档参数
 */
const archiveDiscussion = async (
    api: MediaWikiApi,
    { target, archiveTitle, discussion, archive, summary, baserevid }: ArchiveParams,
) => {
    const bot = new BotInstance(api);
    const exists = await bot.checkExist(archiveTitle);

    await bot.edit(
        exists
            ? { title: archiveTitle, appendtext: `\n\n${archive}`, summary }
            : { title: archiveTitle, text: `{{talkarchive}}\n\n${archive}`, summary },
    );
    await bot.edit({
        title: target,
        text: discussion,
        summary,
        ...(baserevid !== undefined ? { baserevid } : {}),
    });
};

export { archiveDiscussion, type ArchiveParams };
