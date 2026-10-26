//! On-disk data store.
//!
//! The whole database is a single JSON document so it can live inside a
//! OneDrive / Dropbox folder and be synced by the OS. Every record carries
//! `updatedAt` plus a soft-delete flag, which is what makes record-level
//! merging possible during WebDAV sync.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SCHEMA_VERSION: u32 = 2;
const DB_FILE: &str = "schedule.json";
const DB_BACKUP: &str = "schedule.backup.json";
const SNAPSHOT_DIR: &str = "snapshots";
const SNAPSHOT_KEEP: usize = 7;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: String,
    #[serde(default)]
    pub properties: Value,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default = "default_schema")]
    pub schema_version: u32,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub tables: BTreeMap<String, Vec<Record>>,
}

fn default_schema() -> u32 {
    SCHEMA_VERSION
}

impl Default for Store {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            revision: 0,
            device_id: String::new(),
            updated_at: 0,
            tables: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Op {
    pub table: String,
    pub id: String,
    #[serde(default)]
    pub properties: Value,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub deleted: bool,
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl Store {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join(DB_FILE);
        let mut store = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str::<Store>(&text).unwrap_or_default(),
            Err(_) => Store::default(),
        };
        store.migrate();
        store
    }

    fn migrate(&mut self) {
        if self.schema_version < 2 {
            // v1 数据只有 { tableId: [ {id, properties} ] }，补齐时间戳与墓碑字段。
            for rows in self.tables.values_mut() {
                for rec in rows.iter_mut() {
                    if rec.updated_at == 0 {
                        rec.updated_at = 1;
                    }
                }
            }
            self.schema_version = SCHEMA_VERSION;
        }
    }

    pub fn table(&self, id: &str) -> &[Record] {
        self.tables.get(id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn table_mut(&mut self, id: &str) -> &mut Vec<Record> {
        self.tables.entry(id.to_string()).or_default()
    }

    pub fn live(&self, id: &str) -> Vec<&Record> {
        self.table(id).iter().filter(|r| !r.deleted).collect()
    }

    /// Apply a batch coming from the UI. Last write wins per record id.
    pub fn apply(&mut self, ops: Vec<Op>) -> usize {
        let mut touched = 0usize;
        let mut stamped = now_ms();
        for op in ops {
            let rows = self.table_mut(&op.table);
            match rows.iter_mut().find(|r| r.id == op.id) {
                Some(rec) => {
                    rec.properties = op.properties;
                    rec.deleted = op.deleted;
                    rec.updated_at = if op.updated_at > 0 { op.updated_at } else { stamped };
                    if rec.created_at == 0 {
                        rec.created_at = op.created_at;
                    }
                }
                None => {
                    rows.push(Record {
                        id: op.id,
                        properties: op.properties,
                        created_at: if op.created_at > 0 { op.created_at } else { stamped },
                        updated_at: if op.updated_at > 0 { op.updated_at } else { stamped },
                        deleted: op.deleted,
                    });
                }
            }
            touched += 1;
        }
        if touched > 0 {
            if stamped == 0 {
                stamped = now_ms();
            }
            self.revision += 1;
            self.updated_at = stamped;
        }
        touched
    }

    /// Record-level merge: newer `updated_at` wins, ties keep local content.
    pub fn merge_from(&mut self, remote: &Store) -> (usize, usize) {
        let mut local_wins = 0usize;
        let mut remote_wins = 0usize;
        for (table_id, remote_rows) in &remote.tables {
            let rows = self.table_mut(table_id);
            for rrow in remote_rows {
                match rows.iter_mut().find(|x| x.id == rrow.id) {
                    Some(lrow) => {
                        if rrow.updated_at > lrow.updated_at {
                            lrow.properties = rrow.properties.clone();
                            lrow.deleted = rrow.deleted;
                            lrow.updated_at = rrow.updated_at;
                            remote_wins += 1;
                        } else if lrow.updated_at > rrow.updated_at {
                            local_wins += 1;
                        } else if lrow.properties != rrow.properties || lrow.deleted != rrow.deleted {
                            // 同一毫秒两端内容不同：保留较"大"的 JSON 串，保证结果确定。
                            let a = lrow.properties.to_string();
                            let b = rrow.properties.to_string();
                            if b > a {
                                lrow.properties = rrow.properties.clone();
                                lrow.deleted = rrow.deleted;
                                remote_wins += 1;
                            } else {
                                local_wins += 1;
                            }
                        }
                    }
                    None => {
                        rows.push(rrow.clone());
                        remote_wins += 1;
                    }
                }
            }
        }
        if remote_wins > 0 {
            self.revision += 1;
            self.updated_at = now_ms();
        }
        (local_wins, remote_wins)
    }

    pub fn to_boot_json(&self, config: &Value, first_run: bool) -> String {
        let mut root = serde_json::Map::new();
        root.insert(
            "tables".into(),
            serde_json::to_value(&self.tables).unwrap_or(Value::Null),
        );
        root.insert("config".into(), config.clone());
        root.insert("firstRun".into(), Value::Bool(first_run));
        Value::Object(root).to_string()
    }

    // ---------- persistence ----------

    pub fn save(&mut self, dir: &Path) -> std::io::Result<()> {
        fs::create_dir_all(dir)?;
        let target = dir.join(DB_FILE);
        let payload = serde_json::to_vec_pretty(self).map_err(to_io)?;
        atomic_write(&target, &payload)?;
        let _ = fs::copy(&target, dir.join(DB_BACKUP));
        Ok(())
    }

    /// Daily snapshot, keeping the last 7 days.
    pub fn snapshot_daily(&self, dir: &Path) {
        let snap_dir = dir.join(SNAPSHOT_DIR);
        if fs::create_dir_all(&snap_dir).is_err() {
            return;
        }
        let day = chrono::Local::now().format("%Y-%m-%d").to_string();
        let file = snap_dir.join(format!("{day}.json"));
        if file.exists() {
            return;
        }
        if let Ok(bytes) = serde_json::to_vec(self) {
            let _ = atomic_write(&file, &bytes);
        }
        prune_snapshots(&snap_dir);
    }

    pub fn snapshots(dir: &Path) -> Vec<(String, usize)> {
        let mut out = Vec::new();
        if let Ok(entries) = fs::read_dir(dir.join(SNAPSHOT_DIR)) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.ends_with(".json") {
                    continue;
                }
                let count = fs::read_to_string(entry.path())
                    .ok()
                    .and_then(|t| serde_json::from_str::<Store>(&t).ok())
                    .map(|s| s.tables.values().map(|v| v.len()).sum())
                    .unwrap_or(0);
                out.push((name.trim_end_matches(".json").to_string(), count));
            }
        }
        out.sort();
        out.reverse();
        out
    }

    pub fn restore_snapshot(dir: &Path, day: &str) -> Option<Store> {
        let path = dir.join(SNAPSHOT_DIR).join(format!("{day}.json"));
        let text = fs::read_to_string(path).ok()?;
        serde_json::from_str(&text).ok()
    }
}

fn prune_snapshots(dir: &Path) {
    let mut files: Vec<PathBuf> = match fs::read_dir(dir) {
        Ok(entries) => entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
            .collect(),
        Err(_) => return,
    };
    files.sort();
    while files.len() > SNAPSHOT_KEEP {
        let oldest = files.remove(0);
        let _ = fs::remove_file(oldest);
    }
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    // Windows: rename 不能跨卷，同目录下是安全的；已存在时会失败，先删。
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp, path)
}

fn to_io(err: serde_json::Error) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, err)
}
