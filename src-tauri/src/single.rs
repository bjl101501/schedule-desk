//! 单实例 + 二次启动唤起。
//!
//! 旧实现拿到互斥体失败就直接退出，第一个实例完全不知情，于是「程序在托盘里，
//! 双击 exe 却没反应」。这里改成一对命名对象：
//!   · 互斥体：判定是否已有实例
//!   · 事件：第二个进程 SetEvent，第一个进程的等待线程收到后把窗口唤到前台
//!
//! 两者都按数据目录区分：正式实例全局唯一；带 `--data-dir` 的测试/便携实例
//! 用自己的名字，既不干扰正式窗口，也能和正式版同时运行。

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use std::time::Duration;

    type Handle = *mut c_void;

    const EVENT_MODIFY_STATE: u32 = 0x0002;
    const ASFW_ANY: u32 = 0xFFFF_FFFF;
    const INFINITE: u32 = 0xFFFF_FFFF;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(attrs: *const c_void, initial: i32, name: *const u16) -> Handle;
        fn CreateEventW(attrs: *const c_void, manual: i32, initial: i32, name: *const u16) -> Handle;
        fn OpenEventW(access: u32, inherit: i32, name: *const u16) -> Handle;
        fn SetEvent(handle: Handle) -> i32;
        fn WaitForSingleObject(handle: Handle, millis: u32) -> u32;
        fn GetLastError() -> u32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn AllowSetForegroundWindow(pid: u32) -> i32;
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    fn fnv(s: &str) -> String {
        let mut h: u32 = 0x811c_9dc5;
        for b in s.as_bytes() {
            h ^= *b as u32;
            h = h.wrapping_mul(0x0100_0193);
        }
        format!("{h:08x}")
    }

    /// 返回 (互斥体名, 事件名)。
    pub fn names(data_dir_override: Option<&str>) -> (String, String) {
        match data_dir_override {
            Some(dir) => {
                let tag = fnv(dir);
                (
                    format!("Local\\ScheduleDesk.SingleInstance.{tag}"),
                    format!("Local\\ScheduleDesk.Activate.{tag}"),
                )
            }
            None => (
                "Local\\ScheduleDesk.SingleInstance".to_string(),
                "Local\\ScheduleDesk.Activate".to_string(),
            ),
        }
    }

    /// 是否为第一个实例。句柄故意不关闭：进程活着，互斥体就活着。
    pub fn acquire(mutex_name: &str) -> bool {
        let name = wide(mutex_name);
        unsafe {
            let handle = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
            if handle.is_null() {
                return true;
            }
            GetLastError() != 183 // ERROR_ALREADY_EXISTS
        }
    }

    /// 第二个实例：把已有实例叫到前台，然后自己退出。
    pub fn wake(event_name: &str) {
        let name = wide(event_name);
        unsafe {
            for _ in 0..40 {
                let handle = OpenEventW(EVENT_MODIFY_STATE, 0, name.as_ptr());
                if !handle.is_null() {
                    // 新进程刚被用户启动，此刻持有前台权限，转交给第一个实例
                    AllowSetForegroundWindow(ASFW_ANY);
                    SetEvent(handle);
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }

    /// 第一个实例：等待唤醒信号。
    pub fn listen<F>(event_name: &str, on_activate: F)
    where
        F: Fn() + Send + 'static,
    {
        let name = wide(event_name);
        unsafe {
            let handle = CreateEventW(std::ptr::null(), 0, 0, name.as_ptr());
            if handle.is_null() {
                eprintln!("[single] 创建唤起事件失败");
                return;
            }
            // 裸指针不是 Send，转成 usize 再进线程
            let raw = handle as usize;
            std::thread::spawn(move || loop {
                let r = WaitForSingleObject(raw as Handle, INFINITE);
                if r == 0 {
                    on_activate();
                } else {
                    std::thread::sleep(Duration::from_millis(200));
                }
            });
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn names(_data_dir_override: Option<&str>) -> (String, String) {
        (String::new(), String::new())
    }
    pub fn acquire(_mutex_name: &str) -> bool {
        true
    }
    pub fn wake(_event_name: &str) {}
    pub fn listen<F>(_event_name: &str, _on_activate: F)
    where
        F: Fn() + Send + 'static,
    {
    }
}

pub use imp::{acquire, listen, names, wake};
