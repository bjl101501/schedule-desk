/* 导出落盘：桌面版写真实文件，浏览器预览退回 <a download> */
import { invoke, hasHost } from './invoke';
import { toast } from '../store/toast.svelte';

export async function downloadBlob(name: string, content: string, mime = 'application/json'): Promise<boolean> {
  if (hasHost()) {
    try {
      const p = await invoke<string>('export_file', { name: String(name), content: String(content) });
      toast.show('已导出到 ' + p);
      return true;
    } catch (e) {
      toast.show('导出失败：' + String(e));
      return false;
    }
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.show('已导出 ' + name);
  return true;
}
