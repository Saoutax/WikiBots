import type { MwApiResponse } from 'wiki-saikou';
import { BaseApi, formatNamespace } from '@/utils';

type CategoryMembers = {
    ns: number;
    title: string;
}[];

class QueryCategory extends BaseApi {
    /**
     * 查询分类成员
     * @param categories - 分类名或分类名数组
     * @param recursive - 是否递归查询子分类
     * @param type - 查询类型
     * @param namespace - 所查询命名空间
     * @returns - 分类下页面
     */
    query = async (
        categories: string | string[],
        recursive = false,
        type: ('page' | 'subcat' | 'file')[] = ['page', 'subcat', 'file'],
        namespace: number[] = [],
    ) => {
        const result: Set<string> = new Set(),
            visited: Set<string> = new Set(),
            cmtype = type.join('|'),
            cmnamespace = formatNamespace(namespace);

        const categoryArray = Array.isArray(categories) ? categories : [categories];

        for (const category of categoryArray) {
            await this.queryCategory(category, visited, result, recursive, cmnamespace, cmtype);
        }

        return [...result];
    };

    private queryCategory = async (
        category: string,
        visited: Set<string>,
        results: Set<string>,
        recursive: boolean,
        cmnamespace: string,
        cmtype: string,
    ) => {
        if (visited.has(category)) {
            return;
        }
        visited.add(category);

        let cmcontinue;
        do {
            const {
                data,
                data: {
                    query: { categorymembers },
                },
            } = (await this.api.post({
                action: 'query',
                list: 'categorymembers',
                cmtitle: category,
                cmprop: 'title',
                cmnamespace,
                cmtype,
                cmlimit: 'max',
            })) as MwApiResponse;
            for (const member of categorymembers as CategoryMembers) {
                if (member.ns === 14 && recursive) {
                    await this.queryCategory(
                        member.title,
                        visited,
                        results,
                        recursive,
                        cmnamespace,
                        cmtype,
                    );
                } else {
                    results.add(member.title);
                }
            }
            cmcontinue = data?.continue?.cmcontinue;
        } while (cmcontinue);
    };
}

export { QueryCategory };
