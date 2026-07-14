// GENERATED FILE - DO NOT EDIT. Run pnpm generate:result-schema.
import { z } from 'zod';
export declare const AGENT_START_RESULT_SCHEMA: "narada.agent_start.result.v0";
export declare const AGENT_START_RESULT_STATUSES: readonly ["materialized", "dry_run"];
export declare const AGENT_START_SESSION_REF_KINDS: readonly ["runtime", "nars", "carrier"];
declare const sessionRefShape: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
}, "strip", z.ZodTypeAny, {
    id?: string;
    kind?: "runtime" | "nars" | "carrier";
}, {
    id?: string;
    kind?: "runtime" | "nars" | "carrier";
}>;
export declare const AgentStartResultV0Schema: z.ZodUnion<[z.ZodObject<{
    status: z.ZodLiteral<"materialized">;
    handoff: z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    status: z.ZodLiteral<"materialized">;
    handoff: z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    status: z.ZodLiteral<"materialized">;
    handoff: z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough">>, z.ZodObject<{
    status: z.ZodLiteral<"dry_run">;
    handoff: z.ZodOptional<z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    status: z.ZodLiteral<"dry_run">;
    handoff: z.ZodOptional<z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    status: z.ZodLiteral<"dry_run">;
    handoff: z.ZodOptional<z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough">>]>;
export type AgentStartResultV0 = z.infer<typeof AgentStartResultV0Schema>;
export type AgentStartSessionRef = z.infer<typeof sessionRefShape>;
export type AgentStartSessionRefKind = AgentStartSessionRef['kind'];
export type AgentStartSessionProjection = {
    session_ref: AgentStartSessionRef | null;
    session_id: string | null;
    runtime_session_id: string | null;
    nars_session_id: string | null;
    carrier_session_id: string | null;
};
export declare class AgentStartResultContractError extends Error {
    readonly code: "agent_start_result_contract_invalid";
    readonly issues: z.ZodIssue[];
    constructor(issues: z.ZodIssue[]);
}
export declare function parseAgentStartResultV0(value: unknown): z.SafeParseReturnType<z.objectInputType<{
    status: z.ZodLiteral<"materialized">;
    handoff: z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough"> | z.objectInputType<{
    status: z.ZodLiteral<"dry_run">;
    handoff: z.ZodOptional<z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough">, z.objectOutputType<{
    status: z.ZodLiteral<"materialized">;
    handoff: z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough"> | z.objectOutputType<{
    status: z.ZodLiteral<"dry_run">;
    handoff: z.ZodOptional<z.ZodObject<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_ref: z.ZodObject<{
            id: z.ZodString;
            kind: z.ZodEnum<["runtime", "nars", "carrier"]>;
        }, "strip", z.ZodTypeAny, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }, {
            id?: string;
            kind?: "runtime" | "nars" | "carrier";
        }>;
    }, z.ZodTypeAny, "passthrough">>>;
    schema: z.ZodLiteral<"narada.agent_start.result.v0">;
    identity: z.ZodOptional<z.ZodString>;
    runtime: z.ZodOptional<z.ZodString>;
    agent_start_event: z.ZodOptional<z.ZodString>;
    target_site_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    target_site_root: z.ZodOptional<z.ZodString>;
    session_site_root: z.ZodOptional<z.ZodString>;
    launch_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    required_environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    nars_launch: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_session: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    carrier_actions: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        carrier_session_registration: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            nars_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            carrier_session_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            runtime_host_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            launch_operator_surface_kind: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            control_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            session_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            attach_commands: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
            record: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                parent_process: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
                    pid: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
                }, z.ZodTypeAny, "passthrough">>>>;
            }, z.ZodTypeAny, "passthrough">>>>;
        }, z.ZodTypeAny, "passthrough">>>>;
    }, z.ZodTypeAny, "passthrough">>>>;
}, z.ZodTypeAny, "passthrough">>;
export declare function assertAgentStartResultV0(value: unknown): AgentStartResultV0;
export declare function resolveAgentStartSessionProjection(value: unknown): AgentStartSessionProjection | null;
export declare function evaluateAgentStartHandoff(value: unknown): {
    eligible: false;
    status: "invalid";
    session_ref: any;
    session_id: any;
    reason: string;
    detail: string;
} | {
    eligible: false;
    status: "ineligible";
    session_ref: any;
    session_id: any;
    reason: string;
    detail: string;
} | {
    eligible: true;
    status: "eligible";
    session_ref: {
        id?: string;
        kind?: "runtime" | "nars" | "carrier";
    };
    session_id: string;
    reason: any;
    detail: any;
};
export {};
