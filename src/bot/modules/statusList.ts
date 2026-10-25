import data from '@/config/status_data.json';

/** 已完结状态白名单 */
const statusList = [
    ...new Set([
        ...data.done.status,
        ...data.nd.status,
        ...data.wd.status,
        ...data.ad.status,
        ...data.rd.status,
    ]),
];

export { statusList };
