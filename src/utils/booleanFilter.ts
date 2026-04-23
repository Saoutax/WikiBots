/**
 * 根据布尔值将对象中的键名进行分组过滤。
 *
 * @param input - 包含键值对的对象，其中值必须是布尔类型
 * @returns 包含两个数组的对象：
 *          - `isTrue`: 值为 `true` 的键名集合
 *          - `isFalse`: 值为 `false` 的键名集合
 *
 * @example
 * const data = {
 *   active: true,
 *   deleted: false,
 *   verified: true,
 *   archived: false
 * };
 *
 * const result = booleanFilter(data);
 * // result: {
 * //   isTrue: ['active', 'verified'],
 * //   isFalse: ['deleted', 'archived']
 * // }
 */
const booleanFilter = (input: Record<string, boolean>) => {
    const result = {
        isTrue: [] as string[],
        isFalse: [] as string[],
    };
    for (const [item, value] of Object.entries(input)) {
        if (value) {
            result.isTrue.push(item);
        } else {
            result.isFalse.push(item);
        }
    }
    return result;
};

export { booleanFilter };
