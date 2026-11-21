/**
 * 判断字符串是否全为数字
 *
 * @param value - 字符串
 * @returns 是否全为数字
 */
const isDigits = (value: string): boolean => {
    if (!value) {
        return false;
    }

    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);

        if (code < 0x30 || code > 0x39) {
            return false;
        }
    }

    return true;
};

/**
 * 从文本中提取中文日期
 *
 * @param text - 含「YYYY年M月D日」的文本
 * @returns 形如「2026-09-20」的日期
 */
const extractChineseDate = (text: string): string | undefined => {
    const yearEnd = text.indexOf('年');

    if (yearEnd < 4) {
        return undefined;
    }

    const year = text.slice(yearEnd - 4, yearEnd);

    if (!isDigits(year)) {
        return undefined;
    }

    const afterYear = text.slice(yearEnd + 1),
        monthEnd = afterYear.indexOf('月');

    if (monthEnd < 1 || monthEnd > 2) {
        return undefined;
    }

    const month = afterYear.slice(0, monthEnd);

    if (!isDigits(month)) {
        return undefined;
    }

    const afterMonth = afterYear.slice(monthEnd + 1),
        dayEnd = afterMonth.indexOf('日');

    if (dayEnd < 1 || dayEnd > 2) {
        return undefined;
    }

    const day = afterMonth.slice(0, dayEnd);

    if (!isDigits(day)) {
        return undefined;
    }

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export { extractChineseDate };
