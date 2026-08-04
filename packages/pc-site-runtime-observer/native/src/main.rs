use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const NORMAL_INTERVAL_MS: u64 = 10_000;
const BURST_INTERVAL_MS: u64 = 1_000;
const BURST_DURATION_MS: i64 = 60_000;

#[derive(Clone)]
struct Config {
    site_root: PathBuf,
    db: PathBuf,
    service_url: String,
    token_path: PathBuf,
    interval_ms: u64,
    once: bool,
    command: String,
    incident_id: Option<String>,
    review_status: Option<String>,
    review_note: Option<String>,
}

#[derive(Clone)]
struct Owner {
    owner_id: String,
    pid: u32,
    kind: String,
}

#[derive(Clone, Default)]
struct ProcessSample {
    pid: u32,
    parent_pid: u32,
    creation_ticks: u64,
    working_set: u64,
    private_bytes: u64,
    commit_bytes: u64,
    virtual_bytes: u64,
    handles: u32,
    threads: u32,
    cpu_ms: u64,
    executable: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("pc_site_runtime_observer_error:{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = parse_args()?;
    let _singleton = acquire_singleton(&cfg.site_root)?;
    fs::create_dir_all(cfg.db.parent().ok_or("observer_db_parent_missing")?)?;
    let mut db = open_database(&cfg.db)?;
    initialize(&mut db)?;
    if cfg.command == "review-incident" {
        review_incident(&db, &cfg)?;
        return Ok(());
    }
    register_self(&db, &cfg)?;
    write_state(&cfg)?;
    let mut burst_until = 0i64;
    loop {
        let cycle_started_at_ms = now_ms();
        let cycle_timer = Instant::now();
        let lifecycle_changed = ingest_sources(&mut db, &cfg)?;
        if lifecycle_changed {
            burst_until = now_ms() + BURST_DURATION_MS;
        }
        let sampled_processes = sample(&mut db, &cfg)?;
        maintain(&mut db)?;
        record_cycle(
            &db,
            cycle_started_at_ms,
            cycle_timer.elapsed(),
            sampled_processes,
        )?;
        if cfg.once {
            break;
        }
        let interval = if now_ms() < burst_until {
            BURST_INTERVAL_MS
        } else {
            cfg.interval_ms
        };
        thread::sleep(Duration::from_millis(interval));
    }
    Ok(())
}

fn parse_args() -> Result<Config, Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("serve");
    let mut values = HashMap::new();
    let mut index = 2;
    while index + 1 < args.len() {
        values.insert(
            args[index].trim_start_matches("--").to_string(),
            args[index + 1].clone(),
        );
        index += 2;
    }
    let site_root = PathBuf::from(values.get("site-root").ok_or("site_root_required")?);
    let db = PathBuf::from(values.get("db").cloned().unwrap_or_else(|| {
        site_root
            .join(".narada/runtime/mcp-runtime-observer/observations.db")
            .to_string_lossy()
            .to_string()
    }));
    Ok(Config {
        token_path: PathBuf::from(values.get("token-path").ok_or("token_path_required")?),
        service_url: values
            .get("service-url")
            .ok_or("service_url_required")?
            .trim_end_matches('/')
            .to_string(),
        interval_ms: values
            .get("interval-ms")
            .and_then(|v| v.parse().ok())
            .unwrap_or(NORMAL_INTERVAL_MS)
            .clamp(1_000, 60_000),
        site_root,
        db,
        once: command == "sample-once",
        command: command.to_string(),
        incident_id: values.get("incident-id").cloned(),
        review_status: values.get("status").cloned(),
        review_note: values.get("note").cloned(),
    })
}

fn open_database(path: &PathBuf) -> Result<Connection, Box<dyn std::error::Error>> {
    let db = Connection::open(path)?;
    let check: Result<String, _> = db.query_row("PRAGMA quick_check", [], |r| r.get(0));
    if matches!(check.as_deref(), Ok("ok")) {
        return Ok(db);
    }
    drop(db);
    let corrupt = path.with_extension(format!("corrupt.{}", now_ms()));
    fs::rename(path, corrupt)?;
    Ok(Connection::open(path)?)
}

fn review_incident(db: &Connection, cfg: &Config) -> Result<(), Box<dyn std::error::Error>> {
    let id = cfg.incident_id.as_deref().ok_or("incident_id_required")?;
    let status = cfg.review_status.as_deref().unwrap_or("reviewed");
    if status != "reviewed" && status != "dismissed" {
        return Err("incident_review_status_invalid".into());
    }
    let note = cfg
        .review_note
        .as_deref()
        .ok_or("incident_review_note_required")?;
    let changed=db.execute("UPDATE incidents SET status=?1,review_note=?2,updated_at_ms=?3 WHERE incident_id=?4 AND status='open'",params![status,note,now_ms(),id])?;
    if changed != 1 {
        return Err("incident_open_record_not_found".into());
    }
    Ok(())
}

fn initialize(db: &mut Connection) -> rusqlite::Result<()> {
    db.execute_batch(r#"
        PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS schema_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        INSERT OR REPLACE INTO schema_metadata VALUES('schema','narada.mcp_runtime_observer.sqlite.v1');
        CREATE TABLE IF NOT EXISTS source_cursors(path TEXT PRIMARY KEY, offset_bytes INTEGER NOT NULL, imported_at_ms INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS owners(owner_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, authority_ref TEXT NOT NULL, owner_kind TEXT NOT NULL, pid INTEGER, process_started_at TEXT, process_creation_ticks INTEGER, parent_owner_id TEXT, surface_id TEXT, instance_id TEXT, generation_id TEXT, carrier_session_id TEXT, executable_name TEXT, observed_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS lifecycle_events(event_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, occurred_at_ms INTEGER NOT NULL, owner_id TEXT NOT NULL, event_type TEXT NOT NULL, surface_id TEXT, instance_id TEXT, generation_id TEXT, request_id TEXT, status TEXT, inflight INTEGER, raw_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS process_samples(sample_id TEXT PRIMARY KEY, sampled_at_ms INTEGER NOT NULL, owner_id TEXT NOT NULL, pid INTEGER NOT NULL, parent_pid INTEGER NOT NULL, creation_ticks INTEGER NOT NULL, working_set_bytes INTEGER NOT NULL, private_bytes INTEGER NOT NULL, commit_bytes INTEGER NOT NULL, virtual_bytes INTEGER NOT NULL, handle_count INTEGER NOT NULL, thread_count INTEGER NOT NULL, cpu_time_ms INTEGER NOT NULL, executable_name TEXT, sample_status TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS process_samples_owner_time ON process_samples(owner_id,sampled_at_ms);
        CREATE TABLE IF NOT EXISTS worker_samples(sample_id TEXT PRIMARY KEY, sampled_at_ms INTEGER NOT NULL, owner_id TEXT NOT NULL, instance_id TEXT, generation_id TEXT, heap_total_bytes INTEGER NOT NULL, heap_used_bytes INTEGER NOT NULL, external_bytes INTEGER NOT NULL, array_buffers_bytes INTEGER NOT NULL, heap_limit_bytes INTEGER NOT NULL, invocation_count INTEGER NOT NULL, inflight INTEGER NOT NULL, active_resource_counts_json TEXT NOT NULL, sample_status TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS worker_samples_owner_time ON worker_samples(owner_id,sampled_at_ms);
        CREATE TABLE IF NOT EXISTS rollups(minute_ms INTEGER NOT NULL, owner_id TEXT NOT NULL, sample_kind TEXT NOT NULL, samples INTEGER NOT NULL, avg_bytes INTEGER NOT NULL, max_bytes INTEGER NOT NULL, PRIMARY KEY(minute_ms,owner_id,sample_kind));
        CREATE TABLE IF NOT EXISTS incidents(incident_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, opened_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, status TEXT NOT NULL, detector TEXT NOT NULL, attribution TEXT NOT NULL, confidence REAL NOT NULL, baseline_bytes INTEGER, observed_bytes INTEGER, slope_bytes_per_minute REAL, review_note TEXT, UNIQUE(owner_id,detector,status));
        CREATE TABLE IF NOT EXISTS detector_state(owner_id TEXT NOT NULL,detector TEXT NOT NULL,consecutive INTEGER NOT NULL,last_evaluated_ms INTEGER NOT NULL,PRIMARY KEY(owner_id,detector));
        CREATE TABLE IF NOT EXISTS evidence(evidence_id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL, evidence_type TEXT NOT NULL, payload_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS artifacts(artifact_id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER);
        CREATE TABLE IF NOT EXISTS observer_cycles(cycle_id TEXT PRIMARY KEY, started_at_ms INTEGER NOT NULL, duration_ms INTEGER NOT NULL, sampled_processes INTEGER NOT NULL, status TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS observer_cycles_started ON observer_cycles(started_at_ms);
    "#)?;
    let _ = db.execute("ALTER TABLE owners ADD COLUMN process_started_at TEXT", []);
    let _ = db.execute(
        "ALTER TABLE owners ADD COLUMN process_creation_ticks INTEGER",
        [],
    );
    Ok(())
}

fn register_self(db: &Connection, cfg: &Config) -> rusqlite::Result<()> {
    let now = now_ms();
    let registry = cfg.site_root.join(".narada/capabilities/mcp-surfaces.json");
    let site_id = fs::read_to_string(registry)
        .ok()
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .and_then(|v| v.get("site_id").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| "unknown-site".into());
    db.execute("INSERT OR REPLACE INTO owners(owner_id,site_id,authority_ref,owner_kind,pid,process_started_at,process_creation_ticks,parent_owner_id,surface_id,instance_id,generation_id,carrier_session_id,executable_name,observed_at,active) VALUES('observer-overhead',?1,?2,'observer_overhead',?3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?4,?5,1)", params![site_id,format!("site:{site_id}:mcp-surfaces"),std::process::id(), env::current_exe().ok().map(|p| p.to_string_lossy().to_string()), now.to_string()])?;
    Ok(())
}

fn write_state(cfg: &Config) -> Result<(), Box<dyn std::error::Error>> {
    let state = cfg.db.parent().unwrap().join("state.json");
    let temp = cfg
        .db
        .parent()
        .unwrap()
        .join(format!("state.{}.tmp", std::process::id()));
    fs::write(
        &temp,
        serde_json::to_vec_pretty(
            &json!({"schema":"narada.pc_site_runtime_observer.state.v1","status":"ready","pid":std::process::id(),"executable_path":env::current_exe()?,"db_path":cfg.db,"started_at_ms":now_ms()}),
        )?,
    )?;
    fs::rename(temp, state)?;
    Ok(())
}

fn ingest_sources(db: &mut Connection, cfg: &Config) -> Result<bool, Box<dyn std::error::Error>> {
    let root = cfg
        .site_root
        .join(".narada/runtime/mcp-runtime-observer/sources");
    if !root.exists() {
        return Ok(false);
    }
    let mut changed = false;
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.extension().and_then(|v| v.to_str()) != Some("jsonl") {
            continue;
        }
        let offset: u64 = db
            .query_row(
                "SELECT offset_bytes FROM source_cursors WHERE path=?1",
                [path.to_string_lossy().as_ref()],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let size = fs::metadata(&path)?.len();
        let start = if size < offset { 0 } else { offset };
        let mut file = File::open(&path)?;
        file.seek(SeekFrom::Start(start))?;
        let mut text = String::new();
        file.read_to_string(&mut text)?;
        let mut consumed = start;
        let tx = db.transaction()?;
        for part in text.split_inclusive('\n') {
            if !part.ends_with('\n') {
                break;
            }
            consumed += part.as_bytes().len() as u64;
            let value: Value = match serde_json::from_str(part.trim()) {
                Ok(value) => value,
                Err(_) => continue,
            };
            match value.get("schema").and_then(Value::as_str) {
                Some("narada.mcp_runtime.resource_owner.v1") => upsert_owner(&tx, &value)?,
                Some("narada.mcp_runtime.lifecycle_event.v1") => {
                    insert_lifecycle(&tx, &value)?;
                    changed = true;
                }
                _ => {}
            }
        }
        tx.execute("INSERT OR REPLACE INTO source_cursors(path,offset_bytes,imported_at_ms) VALUES(?1,?2,?3)", params![path.to_string_lossy(), consumed, now_ms()])?;
        tx.commit()?;
    }
    Ok(changed)
}

fn upsert_owner(db: &Connection, v: &Value) -> rusqlite::Result<()> {
    db.execute("INSERT INTO owners(owner_id,site_id,authority_ref,owner_kind,pid,process_started_at,process_creation_ticks,parent_owner_id,surface_id,instance_id,generation_id,carrier_session_id,executable_name,observed_at,active) VALUES(?1,?2,?3,?4,?5,?6,NULL,?7,?8,?9,?10,?11,?12,?13,1) ON CONFLICT(owner_id) DO UPDATE SET site_id=excluded.site_id,authority_ref=excluded.authority_ref,owner_kind=excluded.owner_kind,pid=excluded.pid,process_started_at=excluded.process_started_at,parent_owner_id=excluded.parent_owner_id,surface_id=excluded.surface_id,instance_id=excluded.instance_id,generation_id=excluded.generation_id,carrier_session_id=excluded.carrier_session_id,executable_name=excluded.executable_name,observed_at=excluded.observed_at,active=1", params![s(v,"owner_id"),s(v,"site_id"),s(v,"authority_ref"),s(v,"owner_kind"),v.get("pid").and_then(Value::as_u64),sn(v,"process_started_at"),sn(v,"parent_owner_id"),sn(v,"surface_id"),sn(v,"instance_id"),sn(v,"generation_id"),sn(v,"carrier_session_id"),sn(v,"executable_name"),s(v,"observed_at")])?;
    Ok(())
}

fn insert_lifecycle(db: &Connection, v: &Value) -> rusqlite::Result<()> {
    let event_type = s(v, "event_type");
    db.execute("INSERT OR IGNORE INTO lifecycle_events(event_id,occurred_at,occurred_at_ms,owner_id,event_type,surface_id,instance_id,generation_id,request_id,status,inflight,raw_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)", params![s(v,"event_id"),s(v,"occurred_at"),now_ms(),s(v,"owner_id"),event_type,sn(v,"surface_id"),sn(v,"instance_id"),sn(v,"generation_id"),sn(v,"request_id"),sn(v,"status"),v.get("inflight").and_then(Value::as_u64),v.to_string()])?;
    if matches!(
        event_type.as_str(),
        "process_exited" | "generation_terminated"
    ) {
        db.execute(
            "UPDATE owners SET active=0 WHERE owner_id=?1",
            [s(v, "owner_id")],
        )?;
    }
    Ok(())
}

fn sample(db: &mut Connection, cfg: &Config) -> Result<usize, Box<dyn std::error::Error>> {
    let owners = load_owners(db)?;
    let root_pids: HashSet<u32> = owners.iter().map(|o| o.pid).filter(|p| *p > 0).collect();
    let processes = enumerate_processes(&root_pids);
    let now = now_ms();
    let tx = db.transaction()?;
    let mut sampled = HashSet::new();
    let mut process_owners: HashMap<u32, Owner> = HashMap::new();
    for owner in &owners {
        process_owners
            .entry(owner.pid)
            .and_modify(|current| {
                if owner_precedence(&owner.kind) < owner_precedence(&current.kind) {
                    *current = owner.clone();
                }
            })
            .or_insert_with(|| owner.clone());
    }
    for owner in process_owners.values() {
        if let Some(process) = processes.get(&owner.pid) {
            let identity: (Option<i64>, Option<i64>) = tx
                .query_row(
                    "SELECT process_creation_ticks,CAST(strftime('%s',observed_at) AS INTEGER)*1000 FROM owners WHERE owner_id=?1",
                    [&owner.owner_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap_or((None, None));
            let status = process_identity_status(identity.0, identity.1, process.creation_ticks);
            if status == "stale_pid_reused" {
                tx.execute(
                    "UPDATE owners SET active=0 WHERE owner_id=?1",
                    [&owner.owner_id],
                )?;
            } else {
                tx.execute(
                    "UPDATE owners SET process_creation_ticks=?1 WHERE owner_id=?2",
                    params![process.creation_ticks, owner.owner_id],
                )?;
            }
            insert_process_sample(&tx, owner, process, now, status)?;
            sampled.insert(process.pid);
        }
    }
    for owner in &owners {
        if !processes.contains_key(&owner.pid) {
            tx.execute(
                "UPDATE owners SET active=0 WHERE owner_id=?1",
                [&owner.owner_id],
            )?;
        }
    }
    for pid in processes.keys().copied() {
        if sampled.contains(&pid) {
            continue;
        }
        if let Some(process) = processes.get(&pid) {
            let owner = Owner {
                owner_id: format!("descendant-{pid}-{}", process.creation_ticks),
                pid,
                kind: "descendant".into(),
            };
            insert_process_sample(&tx, &owner, process, now, "complete")?;
        }
    }
    tx.commit()?;
    if let Ok(resources) = fetch_resources(cfg) {
        insert_worker_resources(db, &resources, now)?;
    }
    detect_incidents(db, now, &cfg.site_root)?;
    Ok(processes.len())
}

fn record_cycle(
    db: &Connection,
    started_at_ms: i64,
    duration: Duration,
    sampled_processes: usize,
) -> rusqlite::Result<()> {
    let duration_ms = i64::try_from(duration.as_millis()).unwrap_or(i64::MAX);
    db.execute(
        "INSERT INTO observer_cycles(cycle_id,started_at_ms,duration_ms,sampled_processes,status) VALUES(?1,?2,?3,?4,'complete')",
        params![format!("cycle-{started_at_ms}-{}", std::process::id()), started_at_ms, duration_ms, sampled_processes as i64],
    )?;
    Ok(())
}

fn process_identity_status(
    prior_creation_ticks: Option<i64>,
    observed_at_ms: Option<i64>,
    creation_ticks: u64,
) -> &'static str {
    if prior_creation_ticks.is_some() && prior_creation_ticks != Some(creation_ticks as i64) {
        return "stale_pid_reused";
    }
    const WINDOWS_TO_UNIX_EPOCH_MS: i64 = 11_644_473_600_000;
    let creation_ms = (creation_ticks / 10_000) as i64 - WINDOWS_TO_UNIX_EPOCH_MS;
    if observed_at_ms.is_some_and(|observed| (observed - creation_ms).abs() > 120_000) {
        return "stale_pid_reused";
    }
    "complete"
}

fn load_owners(db: &Connection) -> rusqlite::Result<Vec<Owner>> {
    let mut statement = db
        .prepare("SELECT owner_id,pid,owner_kind FROM owners WHERE active=1 AND pid IS NOT NULL")?;
    let rows = statement.query_map([], |row| {
        Ok(Owner {
            owner_id: row.get(0)?,
            pid: row.get::<_, u32>(1)?,
            kind: row.get(2)?,
        })
    })?;
    rows.collect()
}

fn insert_process_sample(
    db: &Connection,
    owner: &Owner,
    p: &ProcessSample,
    now: i64,
    status: &str,
) -> rusqlite::Result<()> {
    db.execute("INSERT OR IGNORE INTO process_samples VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)", params![format!("process-{}-{now}",owner.owner_id),now,owner.owner_id,p.pid,p.parent_pid,p.creation_ticks,p.working_set,p.private_bytes,p.commit_bytes,p.virtual_bytes,p.handles,p.threads,p.cpu_ms,p.executable,status])?;
    Ok(())
}

fn fetch_resources(cfg: &Config) -> Result<Value, Box<dyn std::error::Error>> {
    let token = fs::read_to_string(&cfg.token_path)?.trim().to_string();
    let url = cfg
        .service_url
        .strip_prefix("http://")
        .ok_or("observer_service_url_loopback_http_required")?;
    let (authority, base) = url.split_once('/').unwrap_or((url, ""));
    if !authority.starts_with("127.0.0.1:") && !authority.starts_with("localhost:") {
        return Err("observer_service_url_loopback_required".into());
    }
    let mut stream = TcpStream::connect_timeout(&authority.parse()?, Duration::from_secs(2))?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let prefix = base.trim_matches('/');
    let path = if prefix.is_empty() {
        "/v1/runtime-resources".to_string()
    } else {
        format!("/{prefix}/v1/runtime-resources")
    };
    write!(
        stream,
        "GET {} HTTP/1.1\r\nHost: {}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
        path, authority, token
    )?;
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes)?;
    let text = String::from_utf8(bytes)?;
    let (headers, body) = text
        .split_once("\r\n\r\n")
        .ok_or("observer_service_response_invalid")?;
    if !headers.starts_with("HTTP/1.1 200") {
        return Err("observer_service_response_failed".into());
    }
    Ok(serde_json::from_str(body)?)
}

fn insert_worker_resources(db: &Connection, root: &Value, now: i64) -> rusqlite::Result<()> {
    if let Some(parent) = root
        .pointer("/resources/parent")
        .filter(|value| value.is_object())
    {
        db.execute("INSERT OR IGNORE INTO worker_samples VALUES(?1,?2,'pc-site-surface-service',NULL,NULL,?3,?4,?5,?6,?7,?8,?9,?10,'complete')",params![format!("worker-pc-site-surface-service-{now}"),now,u(parent,"heap_total_bytes"),u(parent,"heap_used_bytes"),u(parent,"external_bytes"),u(parent,"array_buffers_bytes"),u(parent,"heap_limit_bytes"),u(parent,"invocation_count"),u(parent,"inflight"),parent.get("active_resource_counts").unwrap_or(&Value::Null).to_string()])?;
    }
    let instances = root
        .pointer("/resources/instances")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for instance in instances {
        let resources = match instance.get("resources") {
            Some(v) if v.is_object() => v,
            _ => continue,
        };
        let owner = s(&instance, "instance_id");
        db.execute("INSERT OR IGNORE INTO worker_samples VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'complete')", params![format!("worker-{owner}-{now}"),now,owner,sn(&instance,"instance_id"),sn(&instance,"generation_id"),u(resources,"heap_total_bytes"),u(resources,"heap_used_bytes"),u(resources,"external_bytes"),u(resources,"array_buffers_bytes"),u(resources,"heap_limit_bytes"),u(resources,"invocation_count"),u(resources,"inflight"),resources.get("active_resource_counts").unwrap_or(&Value::Null).to_string()])?;
    }
    Ok(())
}

fn detect_incidents(db: &Connection, now: i64, site_root: &PathBuf) -> rusqlite::Result<()> {
    detect_growth(
        db,
        now,
        site_root,
        "process_samples",
        "private_bytes",
        15 * 60_000,
        32 * 1024 * 1024,
        0.20,
        1024.0 * 1024.0,
        "process_growth",
    )?;
    detect_growth(
        db,
        now,
        site_root,
        "worker_samples",
        "heap_used_bytes",
        10 * 60_000,
        16 * 1024 * 1024,
        0.25,
        512.0 * 1024.0,
        "worker_heap_growth",
    )?;
    detect_counter_growth(db, now, site_root, "handle_count", 256, "handle_growth")?;
    detect_counter_growth(db, now, site_root, "thread_count", 8, "thread_growth")?;
    detect_post_release(db, now, site_root)?;
    Ok(())
}

fn detect_growth(
    db: &Connection,
    now: i64,
    site_root: &PathBuf,
    table: &str,
    column: &str,
    window: i64,
    min_growth: i64,
    relative: f64,
    min_slope: f64,
    detector: &str,
) -> rusqlite::Result<()> {
    let sql = format!("SELECT owner_id,sampled_at_ms,{column} FROM {table} WHERE sampled_at_ms>=?1 ORDER BY owner_id,sampled_at_ms");
    let mut statement = db.prepare(&sql)?;
    let values: Vec<(String, i64, i64)> = statement
        .query_map([now - window], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    drop(statement);
    for (owner, samples) in group_samples(values) {
        let qualifies = if samples.len() >= 6
            && samples.last().unwrap().0 - samples.first().unwrap().0 >= 60_000
        {
            let mut baseline_values: Vec<i64> = samples.iter().take(30).map(|(_, v)| *v).collect();
            baseline_values.sort_unstable();
            let baseline = baseline_values[baseline_values.len() / 2];
            let last = samples.last().unwrap().1;
            let minutes = ((samples.last().unwrap().0 - samples.first().unwrap().0) as f64
                / 60_000.0)
                .max(0.01);
            let slope = (last - baseline) as f64 / minutes;
            if last - baseline >= min_growth.max((baseline as f64 * relative) as i64)
                && slope >= min_slope
            {
                Some((baseline, last, slope))
            } else {
                None
            }
        } else {
            None
        };
        evaluate_detector(db, now, site_root, &owner, detector, qualifies)?;
    }
    Ok(())
}

fn detect_counter_growth(
    db: &Connection,
    now: i64,
    site_root: &PathBuf,
    column: &str,
    threshold: i64,
    detector: &str,
) -> rusqlite::Result<()> {
    let sql=format!("SELECT owner_id,sampled_at_ms,{column} FROM process_samples WHERE sampled_at_ms>=?1 ORDER BY owner_id,sampled_at_ms");
    let mut statement = db.prepare(&sql)?;
    let values: Vec<(String, i64, i64)> = statement
        .query_map([now - 15 * 60_000], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    drop(statement);
    for (owner, samples) in group_samples(values) {
        let q = if samples.len() >= 6 {
            let first = samples.first().unwrap().1;
            let last = samples.last().unwrap().1;
            if last - first >= threshold {
                Some((first, last, 0.0))
            } else {
                None
            }
        } else {
            None
        };
        evaluate_detector(db, now, site_root, &owner, detector, q)?;
    }
    Ok(())
}

fn detect_post_release(db: &Connection, now: i64, site_root: &PathBuf) -> rusqlite::Result<()> {
    let mut statement=db.prepare("SELECT owner_id,MAX(occurred_at_ms) FROM lifecycle_events WHERE event_type='instance_released' GROUP BY owner_id")?;
    let released: Vec<(String, i64)> = statement
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    drop(statement);
    for (owner, released_at) in released {
        if now - released_at < 120_000 {
            continue;
        }
        let latest:i64=db.query_row("SELECT private_bytes FROM process_samples WHERE owner_id=?1 ORDER BY sampled_at_ms DESC LIMIT 1",[&owner],|r|r.get(0)).unwrap_or(0);
        let baseline:i64=db.query_row("SELECT CAST(AVG(private_bytes) AS INTEGER) FROM (SELECT private_bytes FROM process_samples WHERE owner_id=?1 AND sampled_at_ms<?2 ORDER BY sampled_at_ms DESC LIMIT 30)",params![owner,released_at],|r|r.get(0)).unwrap_or(0);
        let q = if latest - baseline >= 32 * 1024 * 1024 {
            Some((baseline, latest, 0.0))
        } else {
            None
        };
        evaluate_detector(db, now, site_root, &owner, "post_release_residual", q)?;
    }
    Ok(())
}

fn group_samples(values: Vec<(String, i64, i64)>) -> HashMap<String, Vec<(i64, i64)>> {
    let mut grouped = HashMap::new();
    for (owner, time, value) in values {
        grouped
            .entry(owner)
            .or_insert_with(Vec::new)
            .push((time, value));
    }
    grouped
}

fn evaluate_detector(
    db: &Connection,
    now: i64,
    site_root: &PathBuf,
    owner: &str,
    detector: &str,
    qualifies: Option<(i64, i64, f64)>,
) -> rusqlite::Result<()> {
    let prior: i64 = db
        .query_row(
            "SELECT consecutive FROM detector_state WHERE owner_id=?1 AND detector=?2",
            params![owner, detector],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let consecutive = if qualifies.is_some() { prior + 1 } else { 0 };
    db.execute(
        "INSERT OR REPLACE INTO detector_state VALUES(?1,?2,?3,?4)",
        params![owner, detector, consecutive, now],
    )?;
    if consecutive < 3 {
        return Ok(());
    }
    let (baseline, observed, slope) = qualifies.unwrap();
    let ratio:Option<f64>=db.query_row("SELECT CAST(w.heap_used_bytes+w.external_bytes AS REAL)/NULLIF(p.private_bytes,0) FROM worker_samples w JOIN owners o ON o.owner_id=w.owner_id JOIN process_samples p ON p.owner_id=COALESCE(o.parent_owner_id,o.owner_id) WHERE w.owner_id=?1 ORDER BY p.sampled_at_ms DESC,w.sampled_at_ms DESC LIMIT 1",[owner],|r|r.get(0)).ok();
    let (attribution, confidence) = match ratio.unwrap_or(0.0) {
        v if v >= 0.7 => ("direct", 0.92),
        v if v >= 0.4 => ("partial", 0.70),
        _ => ("residual", 0.45),
    };
    let id = format!("incident-{detector}-{owner}");
    db.execute("INSERT INTO incidents(incident_id,owner_id,opened_at_ms,updated_at_ms,status,detector,attribution,confidence,baseline_bytes,observed_bytes,slope_bytes_per_minute,review_note) VALUES(?1,?2,?3,?3,'open',?4,?5,?6,?7,?8,?9,NULL) ON CONFLICT(owner_id,detector,status) DO UPDATE SET updated_at_ms=excluded.updated_at_ms,observed_bytes=excluded.observed_bytes,slope_bytes_per_minute=excluded.slope_bytes_per_minute,attribution=excluded.attribution,confidence=excluded.confidence",params![id,owner,now,detector,attribution,confidence,baseline,observed,slope])?;
    if consecutive == 3 {
        write_incident_report(
            db,
            site_root,
            &id,
            owner,
            detector,
            attribution,
            confidence,
            baseline,
            observed,
            slope,
            now,
        )?;
    }
    Ok(())
}

fn write_incident_report(
    db: &Connection,
    site_root: &PathBuf,
    id: &str,
    owner: &str,
    detector: &str,
    attribution: &str,
    confidence: f64,
    baseline: i64,
    observed: i64,
    slope: f64,
    now: i64,
) -> rusqlite::Result<()> {
    let root = site_root.join(".narada/runtime/mcp-runtime-observer/incidents");
    let _ = fs::create_dir_all(&root);
    let path = root.join(format!("{id}.json"));
    let temp = root.join(format!("{id}.{}.tmp", std::process::id()));
    let report = json!({"schema":"narada.mcp_runtime.memory_incident_report.v1","incident_id":id,"owner_id":owner,"detector":detector,"attribution":attribution,"confidence":confidence,"baseline_bytes":baseline,"observed_bytes":observed,"slope_bytes_per_minute":slope,"created_at_ms":now,"automatic_actuation":"none"});
    if fs::write(
        &temp,
        serde_json::to_vec_pretty(&report).unwrap_or_default(),
    )
    .is_ok()
        && fs::rename(&temp, &path).is_ok()
    {
        db.execute(
            "INSERT OR IGNORE INTO artifacts VALUES(?1,?2,?3,?4,'sanitized_incident_report',?5)",
            params![
                format!("artifact-{id}"),
                id,
                now,
                path.to_string_lossy(),
                fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
            ],
        )?;
    }
    Ok(())
}

fn owner_precedence(kind: &str) -> u8 {
    match kind {
        "pc_site_service" => 0,
        "carrier_proxy" => 1,
        "loader_child" | "nars_stdio_child" => 2,
        "observer_overhead" => 3,
        _ => 4,
    }
}

fn maintain(db: &mut Connection) -> rusqlite::Result<()> {
    let now = now_ms();
    let raw_cutoff = now - 7 * 24 * 60 * 60_000i64;
    let rollup_cutoff = now - 90 * 24 * 60 * 60_000i64;
    let minute = (now / 60_000 - 1) * 60_000;
    db.execute("INSERT OR REPLACE INTO rollups SELECT ?1,owner_id,'process_private',COUNT(*),CAST(AVG(private_bytes) AS INTEGER),MAX(private_bytes) FROM process_samples WHERE sampled_at_ms>=?1 AND sampled_at_ms<?2 GROUP BY owner_id", params![minute,minute+60_000])?;
    db.execute("INSERT OR REPLACE INTO rollups SELECT ?1,owner_id,'worker_heap',COUNT(*),CAST(AVG(heap_used_bytes) AS INTEGER),MAX(heap_used_bytes) FROM worker_samples WHERE sampled_at_ms>=?1 AND sampled_at_ms<?2 GROUP BY owner_id", params![minute,minute+60_000])?;
    db.execute(
        "DELETE FROM process_samples WHERE sampled_at_ms<?1",
        [raw_cutoff],
    )?;
    db.execute(
        "DELETE FROM worker_samples WHERE sampled_at_ms<?1",
        [raw_cutoff],
    )?;
    db.execute(
        "DELETE FROM observer_cycles WHERE started_at_ms<?1",
        [raw_cutoff],
    )?;
    db.execute("DELETE FROM rollups WHERE minute_ms<?1", [rollup_cutoff])?;
    Ok(())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}
fn sn(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}
fn u(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or(0)
}

#[cfg(windows)]
struct SingletonGuard(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for SingletonGuard {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
fn acquire_singleton(site_root: &PathBuf) -> Result<SingletonGuard, Box<dyn std::error::Error>> {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    let mut hash = 0xcbf29ce484222325u64;
    for byte in site_root.to_string_lossy().to_lowercase().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let mut name: Vec<u16> = format!("Local\\NaradaPcSiteRuntimeObserver-{hash:016x}")
        .encode_utf16()
        .collect();
    name.push(0);
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() {
        return Err("pc_site_runtime_observer_mutex_create_failed".into());
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(handle);
        }
        return Err("pc_site_runtime_observer_already_running".into());
    }
    Ok(SingletonGuard(handle))
}

#[cfg(not(windows))]
struct SingletonGuard;

#[cfg(not(windows))]
fn acquire_singleton(_site_root: &PathBuf) -> Result<SingletonGuard, Box<dyn std::error::Error>> {
    Ok(SingletonGuard)
}

#[cfg(not(windows))]
fn enumerate_processes(_roots: &HashSet<u32>) -> HashMap<u32, ProcessSample> {
    HashMap::new()
}

#[cfg(windows)]
fn enumerate_processes(roots: &HashSet<u32>) -> HashMap<u32, ProcessSample> {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Memory::{VirtualQueryEx, MEMORY_BASIC_INFORMATION, MEM_FREE};
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessImageFileNameW, K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
        PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessHandleCount, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_VM_READ,
    };
    let mut result = HashMap::new();
    let mut topology = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return result;
        }
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snapshot, &mut entry);
        while ok != 0 {
            topology.push((
                entry.th32ProcessID,
                entry.th32ParentProcessID,
                entry.cntThreads,
            ));
            ok = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
        let mut included = roots.clone();
        loop {
            let before = included.len();
            for (pid, parent, _) in &topology {
                if included.contains(parent) {
                    included.insert(*pid);
                }
            }
            if included.len() == before {
                break;
            }
        }
        for (pid, parent, threads) in topology {
            if !included.contains(&pid) {
                continue;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, 0, pid);
            if !handle.is_null() {
                let mut mem: PROCESS_MEMORY_COUNTERS_EX = zeroed();
                mem.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
                let mut handles = 0u32;
                let mut created: FILETIME = zeroed();
                let mut exit: FILETIME = zeroed();
                let mut kernel: FILETIME = zeroed();
                let mut user: FILETIME = zeroed();
                let mut name = [0u16; 1024];
                let name_len =
                    K32GetProcessImageFileNameW(handle, name.as_mut_ptr(), name.len() as u32);
                let memory_ok = K32GetProcessMemoryInfo(
                    handle,
                    &mut mem as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
                    size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
                );
                GetProcessHandleCount(handle, &mut handles);
                GetProcessTimes(handle, &mut created, &mut exit, &mut kernel, &mut user);
                if memory_ok != 0 {
                    let ticks =
                        |v: FILETIME| ((v.dwHighDateTime as u64) << 32) | (v.dwLowDateTime as u64);
                    let mut virtual_bytes = 0u64;
                    let mut address = 0usize;
                    loop {
                        let mut region: MEMORY_BASIC_INFORMATION = zeroed();
                        let read = VirtualQueryEx(
                            handle,
                            address as *const _,
                            &mut region,
                            size_of::<MEMORY_BASIC_INFORMATION>(),
                        );
                        if read == 0 {
                            break;
                        }
                        if region.State != MEM_FREE {
                            virtual_bytes = virtual_bytes.saturating_add(region.RegionSize as u64);
                        }
                        let next = (region.BaseAddress as usize).saturating_add(region.RegionSize);
                        if next <= address {
                            break;
                        }
                        address = next;
                    }
                    result.insert(
                        pid,
                        ProcessSample {
                            pid,
                            parent_pid: parent,
                            creation_ticks: ticks(created),
                            working_set: mem.WorkingSetSize as u64,
                            private_bytes: mem.PrivateUsage as u64,
                            commit_bytes: mem.PagefileUsage as u64,
                            virtual_bytes,
                            handles,
                            threads,
                            cpu_ms: (ticks(kernel) + ticks(user)) / 10_000,
                            executable: String::from_utf16_lossy(&name[..name_len as usize]),
                        },
                    );
                }
                CloseHandle(handle);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_growth_requires_three_confirmed_evaluations_and_never_actuates() {
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&mut db).unwrap();
        db.execute("INSERT INTO owners(owner_id,site_id,authority_ref,owner_kind,pid,parent_owner_id,surface_id,instance_id,generation_id,carrier_session_id,executable_name,observed_at,active) VALUES('owner-1','site-1','site:site-1','pc_site_service',1,NULL,NULL,NULL,NULL,NULL,'fixture','now',1)",[]).unwrap();
        let now = now_ms();
        for (index, value) in [100, 101, 102, 150, 180, 220].iter().enumerate() {
            db.execute("INSERT INTO process_samples VALUES(?1,?2,'owner-1',1,0,1,?3,?3,?3,0,1,1,1,'fixture','complete')",params![format!("sample-{index}"),now-15*60_000+(index as i64)*3*60_000,value*1024*1024]).unwrap();
        }
        let root = env::temp_dir().join(format!("narada-observer-test-{}", std::process::id()));
        for expected in 1..=3 {
            detect_incidents(&db, now, &root).unwrap();
            let count: i64 = db
                .query_row("SELECT COUNT(*) FROM incidents", [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, if expected < 3 { 0 } else { 1 });
        }
        let detector: String = db
            .query_row("SELECT detector FROM incidents", [], |r| r.get(0))
            .unwrap();
        assert_eq!(detector, "process_growth");
        assert!(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%restart%' OR name LIKE '%terminate%'").unwrap().query([]).unwrap().next().unwrap().is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn corrupt_database_is_quarantined_and_recreated() {
        let path =
            env::temp_dir().join(format!("narada-observer-corrupt-{}.db", std::process::id()));
        fs::write(&path, b"not sqlite").unwrap();
        let mut db = open_database(&path).unwrap();
        initialize(&mut db).unwrap();
        assert!(path.exists());
        let _ = fs::remove_file(&path);
        if let Some(parent) = path.parent() {
            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    if entry.file_name().to_string_lossy().starts_with(&format!(
                        "narada-observer-corrupt-{}.corrupt",
                        std::process::id()
                    )) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    #[test]
    fn source_cursor_recovers_after_truncation_without_duplicate_events() {
        let root = env::temp_dir().join(format!("narada-observer-cursor-{}", std::process::id()));
        let sources = root.join(".narada/runtime/mcp-runtime-observer/sources");
        fs::create_dir_all(&sources).unwrap();
        let path = sources.join("fixture.current.jsonl");
        let owner = json!({"schema":"narada.mcp_runtime.resource_owner.v1","owner_id":"owner-a","site_id":"site-1","authority_ref":"site:site-1","owner_kind":"carrier_proxy","pid":1,"process_started_at":null,"parent_owner_id":null,"surface_id":null,"instance_id":null,"generation_id":null,"carrier_session_id":null,"executable_name":"fixture","observed_at":"now"});
        fs::write(&path, format!("{owner}\n")).unwrap();
        let cfg = Config {
            site_root: root.clone(),
            db: root.join("db"),
            service_url: "http://127.0.0.1:1".into(),
            token_path: root.join("token"),
            interval_ms: 10_000,
            once: true,
            command: "sample-once".into(),
            incident_id: None,
            review_status: None,
            review_note: None,
        };
        let mut db = Connection::open_in_memory().unwrap();
        initialize(&mut db).unwrap();
        assert!(!ingest_sources(&mut db, &cfg).unwrap());
        let event = json!({"schema":"narada.mcp_runtime.lifecycle_event.v1","event_id":"event-a","occurred_at":"now","owner_id":"owner-a","event_type":"process_started","surface_id":null,"instance_id":null,"generation_id":null,"request_id":null,"status":"ok","inflight":0});
        fs::write(&path, format!("{event}\n")).unwrap();
        assert!(ingest_sources(&mut db, &cfg).unwrap());
        assert!(!ingest_sources(&mut db, &cfg).unwrap());
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM lifecycle_events", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_sampler_includes_observer_process_creation_identity() {
        let samples = enumerate_processes(&HashSet::from([std::process::id()]));
        let current = samples
            .get(&std::process::id())
            .expect("current process sampled");
        assert!(current.creation_ticks > 0);
        assert!(current.private_bytes > 0);
        assert!(current.threads > 0);
    }

    #[cfg(windows)]
    #[test]
    fn singleton_refuses_a_second_writer_for_the_same_site() {
        let root =
            env::temp_dir().join(format!("narada-observer-singleton-{}", std::process::id()));
        let _first = acquire_singleton(&root).unwrap();
        assert!(acquire_singleton(&root).is_err());
    }

    #[test]
    fn first_observation_rejects_a_pid_created_far_from_the_owner_event() {
        const WINDOWS_TO_UNIX_EPOCH_MS: i64 = 11_644_473_600_000;
        let owner_observed_ms = 1_785_817_000_000i64;
        let matching_ticks = ((owner_observed_ms + WINDOWS_TO_UNIX_EPOCH_MS) as u64) * 10_000;
        assert_eq!(
            process_identity_status(None, Some(owner_observed_ms), matching_ticks),
            "complete"
        );
        assert_eq!(
            process_identity_status(
                None,
                Some(owner_observed_ms),
                matching_ticks + 600_000 * 10_000
            ),
            "stale_pid_reused"
        );
        assert_eq!(
            process_identity_status(Some(matching_ticks as i64), None, matching_ticks + 1),
            "stale_pid_reused"
        );
    }
}
