#[cfg(windows)]
mod windows_supervisor {
    use std::env;
    use std::ffi::c_void;
    use std::fs::{create_dir_all, write};
    use std::io;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::thread::sleep;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    type Handle = *mut c_void;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x00000001;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x00000008;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: u32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x00002000;
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const SYNCHRONIZE: u32 = 0x00100000;
    const WAIT_OBJECT_0: u32 = 0;
    const STILL_ACTIVE: u32 = 259;

    #[repr(C)]
    #[derive(Default)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    struct BasicLimitInformation {
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
        scheduling_priority_class: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct ExtendedLimitInformation {
        basic_limit_information: BasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *mut c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(
            job: Handle,
            information_class: u32,
            information: *mut c_void,
            information_length: u32,
        ) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> Handle;
        fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
        fn GetExitCodeProcess(process: Handle, exit_code: *mut u32) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
        fn MoveFileExW(existing_file_name: *const u16, new_file_name: *const u16, flags: u32) -> i32;
    }

    pub fn run() -> Result<i32, String> {
        let options = parse_args()?;
        let mut command = Command::new(&options.command);
        command
            .args(&options.args)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .creation_flags(CREATE_NO_WINDOW);
        let mut child = command.spawn().map_err(|error| format!("managed_child_spawn_failed:{error}"))?;
        let child_pid = child.id();
        let job = unsafe { CreateJobObjectW(std::ptr::null_mut(), std::ptr::null()) };
        if job.is_null() {
            let _ = child.kill();
            return Err(format!("job_create_failed:{}", io::Error::last_os_error()));
        }
        let mut limits = ExtendedLimitInformation::default();
        limits.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                &mut limits as *mut _ as *mut c_void,
                std::mem::size_of::<ExtendedLimitInformation>() as u32,
            )
        };
        if configured == 0 {
            unsafe { CloseHandle(job); }
            let _ = child.kill();
            return Err(format!("job_configure_failed:{}", io::Error::last_os_error()));
        }
        let assigned = unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as Handle) };
        if assigned == 0 {
            unsafe { CloseHandle(job); }
            let _ = child.kill();
            return Err(format!("job_assign_failed:{}", io::Error::last_os_error()));
        }

        let parent = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
                0,
                options.parent_pid,
            )
        };
        if parent.is_null() {
            unsafe { CloseHandle(job); }
            let _ = child.kill();
            return Err(format!("parent_open_failed:{}", io::Error::last_os_error()));
        }
        write_identity(&options.identity_path, "live", child_pid, options.parent_pid)?;

        let status = loop {
            if let Some(status) = child.try_wait().map_err(|error| format!("managed_child_wait_failed:{error}"))? {
                break status;
            }
            let parent_exited = unsafe { WaitForSingleObject(parent, 0) == WAIT_OBJECT_0 };
            if parent_exited {
                let _ = child.kill();
                break child.wait().map_err(|error| format!("managed_child_reap_failed:{error}"))?;
            }
            sleep(Duration::from_millis(100));
        };
        let code = status.code().unwrap_or_else(|| unsafe {
            let mut exit_code = STILL_ACTIVE;
            if GetExitCodeProcess(child.as_raw_handle() as Handle, &mut exit_code) != 0 && exit_code != STILL_ACTIVE {
                exit_code as i32
            } else {
                1
            }
        });
        let _ = write_identity(&options.identity_path, "closed", child_pid, options.parent_pid);
        unsafe {
            CloseHandle(parent);
            CloseHandle(job);
        }
        Ok(code)
    }

    struct Options {
        identity_path: PathBuf,
        parent_pid: u32,
        command: String,
        args: Vec<String>,
    }

    fn parse_args() -> Result<Options, String> {
        let mut args = env::args().skip(1);
        let mut identity_path = None;
        let mut parent_pid = None;
        let mut command_line = Vec::new();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--identity-path" => identity_path = args.next().map(PathBuf::from),
                "--parent-pid" => {
                    let value = args.next().ok_or("parent_pid_required")?;
                    parent_pid = Some(value.parse::<u32>().map_err(|_| "parent_pid_invalid")?);
                }
                "--" => {
                    command_line.extend(args);
                    break;
                }
                _ => return Err(format!("unknown_argument:{arg}")),
            }
        }
        let command = command_line.first().cloned().ok_or("managed_command_required")?;
        Ok(Options {
            identity_path: identity_path.ok_or("identity_path_required")?,
            parent_pid: parent_pid.ok_or("parent_pid_required")?,
            command,
            args: command_line.into_iter().skip(1).collect(),
        })
    }

    fn write_identity(path: &PathBuf, state: &str, child_pid: u32, parent_pid: u32) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            create_dir_all(parent).map_err(|error| format!("identity_directory_failed:{error}"))?;
        }
        let supervisor_pid = std::process::id();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("identity_clock_failed:{error}"))?
            .as_millis();
        let content = format!(
            "{{\"schema\":\"narada.process_supervisor.identity.v1\",\"state\":\"{}\",\"supervisor_pid\":{},\"managed_child_pid\":{},\"parent_pid\":{},\"observed_at_epoch_ms\":{}}}\n",
            state, supervisor_pid, child_pid, parent_pid, timestamp
        );
        let temporary = path.with_extension(format!("tmp-{}", supervisor_pid));
        write(&temporary, content).map_err(|error| format!("identity_write_failed:{error}"))?;
        let temporary_wide: Vec<u16> = temporary.as_os_str().encode_wide().chain(once(0)).collect();
        let path_wide: Vec<u16> = path.as_os_str().encode_wide().chain(once(0)).collect();
        let replaced = unsafe {
            MoveFileExW(
                temporary_wide.as_ptr(),
                path_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if replaced == 0 {
            return Err(format!("identity_replace_failed:{}", io::Error::last_os_error()));
        }
        Ok(())
    }
}

#[cfg(windows)]
fn main() {
    match windows_supervisor::run() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("narada_process_supervisor_windows_only");
    std::process::exit(78);
}
