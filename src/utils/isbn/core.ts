import { readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import type { Group, RawGroup, Rule } from './types';

/** ISBN 规范化错误 */
class ISBNError extends Error {}

/**
 * 提取纯数字串
 * @param text 原始字符串
 * @returns 仅含数字的字符串
 */
const onlyDigits = (text: string): string => text.replace(/\D/g, '');

/**
 * 提取 ISBN-10 规范串（去非数字与 X 并大写）
 * @param text 原始字符串
 * @returns 大写且仅含数字与 X 的 ISBN-10 串
 */
const canonicalIsbn10 = (text: string): string => text.replace(/[^0-9Xx]/g, '').toUpperCase();

/**
 * 计算 ISBN-13 校验位
 * @param first12 ISBN-13 前 12 位数字
 * @returns 校验位数字（0-9）
 */
const computeIsbn13CheckDigit = (first12: string): number => {
    let total = 0;
    for (let i = 0; i < first12.length; i++) {
        const digit = Number(first12[i]);
        total += i % 2 === 0 ? digit : digit * 3;
    }
    return (10 - (total % 10)) % 10;
};

/**
 * 校验 ISBN-13 数字串
 * @param digits13 13 位数字
 * @returns 校验位是否正确
 */
const isValidIsbn13 = (digits13: string): boolean => {
    if (digits13.length !== 13 || !/^\d{13}$/.test(digits13)) {
        return false;
    }
    return computeIsbn13CheckDigit(digits13.slice(0, 12)) === Number(digits13[12]);
};

/**
 * 计算 ISBN-10 校验位（可为 X）
 * @param first9 ISBN-10 前 9 位数字
 * @returns 校验位（0-9 或 X）
 */
const computeIsbn10CheckDigit = (first9: string): string => {
    let total = 0;
    for (let i = 0; i < first9.length; i++) {
        total += (10 - i) * Number(first9[i]);
    }
    const remainder = total % 11;
    const value = (11 - remainder) % 11;
    return value === 10 ? 'X' : String(value);
};

/**
 * 校验 ISBN-10（末位可为 X）
 * @param code10 10 位 ISBN-10
 * @returns 校验位是否正确
 */
const isValidIsbn10 = (code10: string): boolean => {
    if (code10.length !== 10) {
        return false;
    }
    const head = code10.slice(0, 9);
    const last = code10[9];
    if (!/^\d{9}$/.test(head)) {
        return false;
    }
    if (last === undefined || (last !== 'X' && !/^\d$/.test(last))) {
        return false;
    }
    return computeIsbn10CheckDigit(head) === last;
};

/**
 * ISBN-10 转为 ISBN-13 数字串
 * @param code10 有效 ISBN-10
 * @returns 13 位 ISBN-13 数字串
 */
const isbn10ToIsbn13Digits = (code10: string): string => {
    const first12 = `978${code10.slice(0, 9)}`;
    return `${first12}${computeIsbn13CheckDigit(first12)}`;
};

/**
 * 生成 ISBN 语义等价键（ISBN-10 归一化为 ISBN-13 数字串）
 * @param rawIsbn 原始 ISBN 字符串
 * @returns 13 位等价键；非有效 ISBN 返回 null
 */
const isbnEquivalenceKey = (rawIsbn: string): string | null => {
    const code13 = onlyDigits(rawIsbn);
    if (code13.length === 13 && isValidIsbn13(code13)) {
        return code13;
    }
    const code10 = canonicalIsbn10(rawIsbn);
    if (code10.length === 10 && isValidIsbn10(code10)) {
        return isbn10ToIsbn13Digits(code10);
    }
    return null;
};

const RANGE_PARSER = new XMLParser({
    parseTagValue: false,
    isArray: name => name === 'Group' || name === 'Rule',
});

/**
 * 解析 RangeMessage.xml 文本为号段分组
 * @param xml RangeMessage.xml 内容
 * @returns 号段分组（按 group 长度降序）
 * @throws 未解析出任何号段时抛 ISBNError
 */
const parseRangeMessageXml = (xml: string): Group[] => {
    const root = RANGE_PARSER.parse(xml) as {
        ISBNRangeMessage?: { RegistrationGroups?: { Group?: RawGroup[] } };
    };
    const groups: Group[] = [];
    for (const rawGroup of root?.ISBNRangeMessage?.RegistrationGroups?.Group ?? []) {
        const prefix = (rawGroup?.Prefix ?? '').trim();
        if (!prefix.includes('-')) {
            continue;
        }
        const [gs1, group] = prefix.split('-', 2) as [string, string];
        const rules: Rule[] = [];
        for (const rawRule of rawGroup?.Rules?.Rule ?? []) {
            const rangeText = (rawRule?.Range ?? '').trim();
            const lengthText = (rawRule?.Length ?? '').trim();
            if (!rangeText || !lengthText) {
                continue;
            }
            const registrantLength = Number(lengthText);
            if (!Number.isInteger(registrantLength) || registrantLength <= 0) {
                continue;
            }
            const [startText, endText] = rangeText.split('-', 2) as [string, string];
            rules.push({ start: Number(startText), end: Number(endText), registrantLength });
        }
        if (rules.length > 0) {
            groups.push({ gs1, group, rules });
        }
    }
    groups.sort((a, b) => b.group.length - a.group.length);
    if (groups.length === 0) {
        throw new ISBNError('No registration groups parsed from RangeMessage.xml.');
    }
    return groups;
};

/**
 * 读取并解析号段规则文件
 * @param xmlPath RangeMessage.xml 路径
 * @returns 号段分组（按 group 长度降序）
 */
const loadGroups = async (xmlPath: string): Promise<Group[]> =>
    parseRangeMessageXml(await readFile(xmlPath, 'utf8'));

/**
 * 将 registrant+publication 前缀映射到 7 位号段区间
 * @param regPub registrant+publication 前缀串
 * @returns [low, high] 7 位区间；空串返回 null
 */
const to7DigitInterval = (regPub: string): [number, number] | null => {
    if (!regPub) {
        return null;
    }
    if (regPub.length >= 7) {
        const head7 = Number(regPub.slice(0, 7));
        return [head7, head7];
    }
    const scale = 10 ** (7 - regPub.length);
    const low = Number(regPub) * scale;
    return [low, low + scale - 1];
};

/**
 * ISBN-13 按号段规则连字符化
 * @param digits13 13 位 ISBN-13 数字串
 * @param groups 号段分组
 * @param withLabel 输出是否带 "ISBN " 前缀
 * @returns 连字符格式的 ISBN
 * @throws 位数、前缀、校验位非法或无法匹配号段时抛 ISBNError
 */
const hyphenateIsbn13 = (digits13: string, groups: readonly Group[], withLabel = false): string => {
    if (!/^\d{13}$/.test(digits13)) {
        throw new ISBNError('ISBN must contain exactly 13 digits.');
    }
    if (!digits13.startsWith('978') && !digits13.startsWith('979')) {
        throw new ISBNError('ISBN-13 must start with 978 or 979.');
    }
    if (!isValidIsbn13(digits13)) {
        throw new ISBNError('Invalid ISBN-13 check digit.');
    }
    const checkDigit = digits13[12]!;
    for (const group of groups) {
        const prefixNoHyphen = `${group.gs1}${group.group}`;
        if (!digits13.startsWith(prefixNoHyphen)) {
            continue;
        }
        const regPub = digits13.slice(prefixNoHyphen.length, 12);
        const interval = to7DigitInterval(regPub);
        if (interval === null) {
            continue;
        }
        const [low, high] = interval;
        for (const rule of group.rules) {
            if (low < rule.start || high > rule.end) {
                continue;
            }
            if (rule.registrantLength > regPub.length) {
                continue;
            }
            const registrant = regPub.slice(0, rule.registrantLength);
            const publication = regPub.slice(rule.registrantLength);
            if (!publication) {
                continue;
            }
            const normalised = `${group.gs1}-${group.group}-${registrant}-${publication}-${checkDigit}`;
            return withLabel ? `ISBN ${normalised}` : normalised;
        }
    }
    throw new ISBNError('Could not map ISBN to a registration group/range rule.');
};

/**
 * ISBN-10 按号段规则连字符化
 * @param code10 有效 ISBN-10
 * @param groups 号段分组
 * @param withLabel 输出是否带 "ISBN " 前缀
 * @returns 连字符格式的 ISBN-10
 * @throws 校验位非法或无法匹配号段时抛 ISBNError
 */
const hyphenateIsbn10 = (code10: string, groups: readonly Group[], withLabel = false): string => {
    if (!isValidIsbn10(code10)) {
        throw new ISBNError('Invalid ISBN-10 check digit.');
    }
    const digits13 = isbn10ToIsbn13Digits(code10);
    for (const group of groups) {
        const prefixNoHyphen = `${group.gs1}${group.group}`;
        if (!digits13.startsWith(prefixNoHyphen)) {
            continue;
        }
        const regPub = digits13.slice(prefixNoHyphen.length, 12);
        const interval = to7DigitInterval(regPub);
        if (interval === null) {
            continue;
        }
        const [low, high] = interval;
        for (const rule of group.rules) {
            if (low < rule.start || high > rule.end) {
                continue;
            }
            if (rule.registrantLength > regPub.length) {
                continue;
            }
            const registrant = regPub.slice(0, rule.registrantLength);
            const publication = regPub.slice(rule.registrantLength);
            if (!publication) {
                continue;
            }
            const normalised = `${group.group}-${registrant}-${publication}-${code10[9]!}`;
            return withLabel ? `ISBN ${normalised}` : normalised;
        }
    }
    throw new ISBNError('Could not map ISBN-10 to a registration group/range rule.');
};

/**
 * 规范化单个 ISBN 为连字符格式
 * @param rawIsbn 原始 ISBN（ISBN-10 或 ISBN-13）
 * @param groups 号段分组
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @param withLabel 输出是否带 "ISBN " 前缀
 * @throws 输入非有效 ISBN 时抛 ISBNError
 */
const normaliseToken = (
    rawIsbn: string,
    groups: readonly Group[],
    convert10To13: boolean,
    withLabel = false,
): string => {
    const code13 = onlyDigits(rawIsbn);
    if (code13.length === 13) {
        return hyphenateIsbn13(code13, groups, withLabel);
    }
    const code10 = canonicalIsbn10(rawIsbn);
    if (code10.length === 10) {
        if (!isValidIsbn10(code10)) {
            throw new ISBNError('Invalid ISBN-10 check digit.');
        }
        if (convert10To13) {
            return hyphenateIsbn13(isbn10ToIsbn13Digits(code10), groups, withLabel);
        }
        return hyphenateIsbn10(code10, groups, withLabel);
    }
    throw new ISBNError('ISBN must be valid ISBN-10 or ISBN-13.');
};

/**
 * 按号段文件规范化单个 ISBN（便捷入口）
 * @param rawIsbn 原始 ISBN（ISBN-10 或 ISBN-13）
 * @param xmlPath RangeMessage.xml 路径
 * @param withLabel 输出是否带 "ISBN " 前缀
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @throws 输入非有效 ISBN 或号段文件解析失败时抛 ISBNError
 */
const normalise = async (
    rawIsbn: string,
    xmlPath: string,
    withLabel = false,
    convert10To13 = false,
): Promise<string> => {
    const groups = await loadGroups(xmlPath);
    return normaliseToken(rawIsbn, groups, convert10To13, withLabel);
};

export {
    ISBNError,
    canonicalIsbn10,
    isValidIsbn13,
    isValidIsbn10,
    isbnEquivalenceKey,
    parseRangeMessageXml,
    loadGroups,
    normaliseToken,
    normalise,
};
