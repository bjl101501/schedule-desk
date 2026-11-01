/*
  数据层门面。实现拆在 data/ 下：
    state    唯一数据源 + findTask + pushProxied
    write    单条 record 的写库 API
    tasks    勾选 / 子项 / 重复 / 删除 / 保存
    cache    本地缓存、每日快照、种子标记
    holiday  「下一个假期」系统条目
    bulk     整库加载、清空、导入、种示例数据
  这里只做 re-export，调用点统一 import '$lib/store/data.svelte'，拆分不影响使用方。
*/
export * from './data/state.svelte';
export * from './data/write';
export * from './data/tasks';
export * from './data/cache.svelte';
export * from './data/holiday';
export * from './data/bulk.svelte';
