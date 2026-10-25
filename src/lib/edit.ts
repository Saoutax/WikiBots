import type { MwApiParams } from 'wiki-saikou';
import { BaseApi } from '@/utils';

/** 编辑目标：标题与页面 ID 二选一 */
type PageRef =
    | { title: string; pageid?: number | string }
    | { pageid: number | string; title?: string };

interface EditTarget {
    summary: string;
    /** 新内容 */
    text?: string | number;
    /** 追加内容 */
    appendtext?: string;
    /** 章节编号，'new' 表示新章节 */
    section?: string;
    /** 新章节标题，配合 section: 'new' 使用 */
    sectiontitle?: string;
    /** 是否标记为小编辑，默认为 true */
    minor?: boolean;
    /** 显式标记为非小编辑，设置后不再下发 minor */
    notminor?: boolean;
    /** 机器人编辑标记，默认为 true */
    bot?: boolean;
    /** 编辑标签，站点未配置对应标签时不应下发 */
    tags?: string;
    /** 监视列表设置，默认为 nochange */
    watchlist?: string;
    /** 页面不存在时不创建 */
    nocreate?: boolean;
    /** 基线版本号，用于避免覆盖他人编辑 */
    baserevid?: number;
}

type EditParams = PageRef & EditTarget;

/**
 * 统一的页面编辑操作
 */
class EditPage extends BaseApi {
    /**
     * 编辑页面
     * @param params - 编辑参数
     * @returns 编辑响应
     */
    edit = async ({
        title,
        pageid,
        summary,
        text,
        appendtext,
        section,
        sectiontitle,
        minor,
        notminor,
        bot,
        tags,
        watchlist,
        nocreate,
        baserevid,
    }: EditParams) => {
        const body: MwApiParams = {
            action: 'edit',
            title,
            pageid,
            summary,
            text,
            appendtext,
            section,
            sectiontitle,
            bot: bot ?? true,
            watchlist: watchlist ?? 'nochange',
            tags,
            nocreate,
            baserevid,
            ...(notminor ? { notminor: true } : { minor: minor ?? true }),
        };

        return this.api.postWithToken('csrf', body, { retry: 10, noCache: true });
    };
}

export { EditPage };
export type { EditParams, PageRef };
