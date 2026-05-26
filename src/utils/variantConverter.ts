import OpenCC from 'opencc-js';

/**
 * 将输入文字（简体或繁体）转换为 CN / TW / HK 三种变体，以数组形式返回
 *
 * @param input - 待转换的文本
 * @returns [zh-cn, zh-tw, zh-hk]
 */
const variantConverter = (input: string) => {
    const fromTW = OpenCC.Converter({ from: 'tw', to: 'cn' }),
        fromHK = OpenCC.Converter({ from: 'hk', to: 'cn' });
    const simplified = fromHK(fromTW(input));

    const toTW = OpenCC.Converter({ from: 'cn', to: 'tw' }),
        toHK = OpenCC.Converter({ from: 'cn', to: 'hk' });

    return [...new Set([simplified, toTW(simplified), toHK(simplified)])];
};

export { variantConverter };
