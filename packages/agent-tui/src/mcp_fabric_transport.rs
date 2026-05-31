use crate::mcp_fabric_boundary::{McpFabricBoundary, McpFabricPolicy, McpToolRequest};
use crate::mcp_json_rpc::McpJsonRpcExchange;
use crate::{carrier_protocol::SessionEvent, input_queue::SessionEvidenceContext};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpFabricTransportClient {
    pub config_path: String,
    pub site_id: Option<String>,
    pub carrier: Option<String>,
    pub servers: BTreeMap<String, McpFabricTransportServer>,
    pub tool_to_server: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpFabricTransportServer {
    pub name: String,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
    pub tools: BTreeSet<String>,
    pub surface_id: Option<String>,
    pub target_site_root: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpFabricPreparedToolCall {
    pub server_name: String,
    pub command: String,
    pub args: Vec<String>,
    pub tool_name: String,
    pub request_event: SessionEvent,
    pub json_rpc: McpJsonRpcExchange,
}

#[derive(Debug, Deserialize)]
struct CarrierConfigFile {
    site_id: Option<String>,
    carrier: Option<String>,
    #[serde(default, rename = "mcpServers")]
    mcp_servers: BTreeMap<String, RawMcpServer>,
}
#[derive(Debug, Deserialize)]
struct RawMcpServer {
    transport: Option<String>,
    command: Option<String>,
    args: Option<Value>,
    tools: Option<Value>,
    allowed_tools: Option<Value>,
    tool_names: Option<Value>,
    surface_id: Option<String>,
    target_site_root: Option<String>,
}

impl McpFabricTransportClient {
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        let content = fs::read_to_string(path)
            .map_err(|error| format!("mcp_fabric_config_read_failed:{}:{error}", path.display()))?;
        Self::from_json_str(path.display().to_string(), &content)
    }

    pub fn from_json_str(config_path: impl Into<String>, content: &str) -> Result<Self, String> {
        let value: Value = serde_json::from_str(content)
            .map_err(|error| format!("mcp_fabric_config_parse_failed:{error}"))?;
        validate_config_shape(&value)?;
        let config: CarrierConfigFile = serde_json::from_value(value)
            .map_err(|error| format!("mcp_fabric_config_parse_failed:{error}"))?;
        let mut servers = BTreeMap::new();
        let mut tool_to_server = BTreeMap::new();
        for (raw_name, raw) in config.mcp_servers {
            let server = McpFabricTransportServer::from_raw(raw_name, raw)?;
            let name = server.name.clone();
            if servers.contains_key(&name) {
                return Err(format!("mcp_fabric_server_name_duplicate:{name}"));
            }
            for tool in &server.tools {
                if let Some(previous) = tool_to_server.insert(tool.clone(), name.clone()) {
                    return Err(format!(
                        "mcp_fabric_tool_ambiguous:{tool}:{previous}:{name}"
                    ));
                }
            }
            servers.insert(name, server);
        }
        Ok(Self {
            config_path: config_path.into(),
            site_id: normalize_optional_config_field("site_id", config.site_id)?,
            carrier: normalize_optional_config_field("carrier", config.carrier)?,
            servers,
            tool_to_server,
        })
    }

    pub fn policy_from_visible_tools(
        &self,
        fabric_root: impl Into<String>,
        policy_source: impl Into<String>,
    ) -> McpFabricPolicy {
        McpFabricPolicy::from_allowed_tools(
            fabric_root,
            policy_source,
            self.tool_to_server.keys().cloned(),
        )
    }

    pub fn admitted_boundary(
        &self,
        fabric_root: impl Into<String>,
        policy_source: impl Into<String>,
    ) -> McpFabricBoundary {
        McpFabricBoundary::admitted(self.policy_from_visible_tools(fabric_root, policy_source))
    }

    pub fn resolve_tool(&self, tool_name: &str) -> Result<&McpFabricTransportServer, String> {
        let Some(server_name) = self.tool_to_server.get(tool_name) else {
            return Err(format!("mcp_fabric_tool_not_configured:{tool_name}"));
        };
        self.servers
            .get(server_name)
            .ok_or_else(|| format!("mcp_fabric_server_missing:{server_name}"))
    }

    pub fn prepare_tool_call(
        &self,
        boundary: &McpFabricBoundary,
        request: &McpToolRequest,
        arguments: Value,
        json_rpc_id: u64,
        context: &SessionEvidenceContext,
        event_id: impl Into<String>,
        occurred_at: impl Into<String>,
    ) -> Result<McpFabricPreparedToolCall, String> {
        boundary.assert_tool_access(&request.tool_name)?;
        let server = self.resolve_tool(&request.tool_name)?;
        let request_event = boundary.tool_request_event(request, context, event_id, occurred_at)?;
        let json_rpc = McpJsonRpcExchange::for_tool_call(json_rpc_id, request, arguments)?;
        Ok(McpFabricPreparedToolCall {
            server_name: server.name.clone(),
            command: server.command.clone(),
            args: server.args.clone(),
            tool_name: request.tool_name.clone(),
            request_event,
            json_rpc,
        })
    }
}

impl McpFabricTransportServer {
    fn from_raw(name: String, raw: RawMcpServer) -> Result<Self, String> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err("mcp_fabric_server_name_invalid".to_string());
        }
        let transport = raw
            .transport
            .unwrap_or_else(|| "stdio".to_string())
            .trim()
            .to_string();
        if transport.is_empty() {
            return Err(format!("mcp_fabric_transport_invalid:{name}"));
        }
        if transport != "stdio" {
            return Err(format!(
                "mcp_fabric_transport_unsupported:{name}:{transport}"
            ));
        }
        let command = raw
            .command
            .ok_or_else(|| format!("mcp_fabric_server_command_missing:{name}"))?
            .trim()
            .to_string();
        if command.is_empty() {
            return Err(format!("mcp_fabric_server_command_invalid:{name}"));
        }
        let raw_tools = select_tool_list(&name, raw.tools, raw.allowed_tools, raw.tool_names)?;
        let mut tools = BTreeSet::new();
        for tool in raw_tools {
            let tool = tool.trim().to_string();
            if tool.is_empty() {
                return Err(format!("mcp_fabric_server_tool_name_invalid:{name}"));
            }
            tools.insert(tool);
        }
        if tools.is_empty() {
            return Err(format!("mcp_fabric_server_tools_missing:{name}"));
        }
        let args = select_args(&name, raw.args)?;
        let surface_id = normalize_optional_server_field(&name, "surface_id", raw.surface_id)?;
        let target_site_root =
            normalize_optional_server_field(&name, "target_site_root", raw.target_site_root)?;
        Ok(Self {
            name,
            transport,
            command,
            args,
            tools,
            surface_id,
            target_site_root,
        })
    }
}

fn validate_config_shape(value: &Value) -> Result<(), String> {
    let Some(config) = value.as_object() else {
        return Err("mcp_fabric_config_shape_invalid".to_string());
    };
    if let Some(mcp_servers) = config.get("mcpServers") {
        let Some(server_map) = mcp_servers.as_object() else {
            return Err("mcp_fabric_config_mcp_servers_invalid".to_string());
        };
        for (server_name, server) in server_map {
            let server_name = server_name.trim();
            if !server.is_object() {
                return Err(format!("mcp_fabric_server_record_invalid:{server_name}"));
            }
        }
    }
    Ok(())
}

fn normalize_optional_config_field(
    field_name: &str,
    value: Option<String>,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(format!("mcp_fabric_config_{field_name}_invalid"));
    }
    Ok(Some(value))
}

fn select_args(server_name: &str, args: Option<Value>) -> Result<Vec<String>, String> {
    let Some(value) = args else {
        return Ok(Vec::new());
    };
    let Some(values) = value.as_array() else {
        return Err(format!("mcp_fabric_server_args_invalid:{server_name}"));
    };
    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| format!("mcp_fabric_server_arg_invalid:{server_name}"))
        })
        .map(|arg| {
            let arg = arg?.trim().to_string();
            if arg.is_empty() {
                return Err(format!("mcp_fabric_server_arg_invalid:{server_name}"));
            }
            Ok(arg)
        })
        .collect()
}

fn select_tool_list(
    server_name: &str,
    tools: Option<Value>,
    allowed_tools: Option<Value>,
    tool_names: Option<Value>,
) -> Result<Vec<String>, String> {
    let configured_count = u8::from(tools.is_some())
        + u8::from(allowed_tools.is_some())
        + u8::from(tool_names.is_some());
    if configured_count > 1 {
        return Err(format!(
            "mcp_fabric_server_tool_list_ambiguous:{server_name}"
        ));
    }
    let Some((field_name, value)) = tools
        .map(|value| ("tools", value))
        .or_else(|| allowed_tools.map(|value| ("allowed_tools", value)))
        .or_else(|| tool_names.map(|value| ("tool_names", value)))
    else {
        return Ok(Vec::new());
    };
    let Some(values) = value.as_array() else {
        return Err(format!(
            "mcp_fabric_server_tool_list_invalid:{server_name}:{field_name}"
        ));
    };
    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| format!("mcp_fabric_server_tool_name_invalid:{server_name}"))
        })
        .collect()
}
fn normalize_optional_server_field(
    server_name: &str,
    field_name: &str,
    value: Option<String>,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(format!(
            "mcp_fabric_server_{field_name}_invalid:{server_name}"
        ));
    }
    Ok(Some(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::SessionEventKind;

    fn config_json() -> &'static str {
        r#"{
          "schema": "narada.mcp.carrier_client_config.v0",
          "site_id": "narada-sonar",
          "carrier": "agent-tui",
          "mcpServers": {
            "sonar-site-loop": {
              "transport": "stdio",
              "command": "node",
              "args": ["site-loop.mjs"],
              "tools": ["site_loop_run_once", "site_loop_status"],
              "surface_id": "sonar.site-loop",
              "target_site_root": "D:/code/narada.sonar"
            }
          }
        }"#
    }

    fn context() -> SessionEvidenceContext {
        SessionEvidenceContext {
            carrier_session_id: "carrier_fixture_1".to_string(),
            agent_id: "sonar.resident".to_string(),
            site_id: "narada-sonar".to_string(),
            site_root: "D:/code/narada.sonar".to_string(),
        }
    }

    #[test]
    fn parses_policy_bound_site_mcp_config() {
        let client = McpFabricTransportClient::from_json_str("fixture.mcp.json", config_json())
            .expect("config parses");

        assert_eq!(client.site_id.as_deref(), Some("narada-sonar"));
        assert_eq!(client.servers.len(), 1);
        assert_eq!(
            client
                .tool_to_server
                .get("site_loop_run_once")
                .map(String::as_str),
            Some("sonar-site-loop")
        );
    }

    #[test]
    fn rejects_non_object_mcp_servers() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": []
            }"#,
        )
        .expect_err("mcpServers must be an object");

        assert_eq!(error, "mcp_fabric_config_mcp_servers_invalid");
    }

    #[test]
    fn rejects_non_object_server_record() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": []
              }
            }"#,
        )
        .expect_err("server record must be an object");

        assert_eq!(error, "mcp_fabric_server_record_invalid:sonar-site-loop");
    }

    #[test]
    fn rejects_blank_top_level_site_id() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "site_id": " ",
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("blank top-level site_id is invalid");

        assert_eq!(error, "mcp_fabric_config_site_id_invalid");
    }

    #[test]
    fn rejects_blank_top_level_carrier() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "carrier": " ",
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("blank top-level carrier is invalid");

        assert_eq!(error, "mcp_fabric_config_carrier_invalid");
    }

    #[test]
    fn trims_top_level_metadata() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "site_id": " narada-sonar ",
              "carrier": " agent-tui ",
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect("trimmed top-level metadata parses");

        assert_eq!(client.site_id.as_deref(), Some("narada-sonar"));
        assert_eq!(client.carrier.as_deref(), Some("agent-tui"));
    }

    #[test]
    fn rejects_blank_server_name() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                " ": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("blank server name is invalid");

        assert_eq!(error, "mcp_fabric_server_name_invalid");
    }

    #[test]
    fn trims_server_name() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                " sonar-site-loop ": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect("trimmed server name config parses");

        assert!(client.servers.contains_key("sonar-site-loop"));
        assert_eq!(
            client
                .tool_to_server
                .get("site_loop_status")
                .map(String::as_str),
            Some("sonar-site-loop")
        );
    }

    #[test]
    fn rejects_duplicate_normalized_server_name() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"]
                },
                " sonar-site-loop ": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_run_once"]
                }
              }
            }"#,
        )
        .expect_err("duplicate normalized server name is invalid");

        assert_eq!(error, "mcp_fabric_server_name_duplicate:sonar-site-loop");
    }

    #[test]
    fn rejects_blank_transport() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": " ",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("blank transport is invalid");

        assert_eq!(error, "mcp_fabric_transport_invalid:sonar-site-loop");
    }

    #[test]
    fn trims_transport() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": " stdio ",
                  "command": "node",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect("trimmed transport config parses");

        assert_eq!(client.servers["sonar-site-loop"].transport, "stdio");
    }

    #[test]
    fn rejects_blank_server_command() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": " ",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("blank command is invalid");

        assert_eq!(error, "mcp_fabric_server_command_invalid:sonar-site-loop");
    }

    #[test]
    fn trims_server_command() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": " node ",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect("trimmed command config parses");

        assert_eq!(client.servers["sonar-site-loop"].command, "node");
    }

    #[test]
    fn rejects_invalid_server_args_shape() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "args": "site-loop.mjs",
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("args must be an array");

        assert_eq!(error, "mcp_fabric_server_args_invalid:sonar-site-loop");
    }

    #[test]
    fn rejects_non_string_server_arg() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "args": [1],
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("args must contain strings");

        assert_eq!(error, "mcp_fabric_server_arg_invalid:sonar-site-loop");
    }

    #[test]
    fn rejects_blank_server_arg() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "args": ["site-loop.mjs", " "],
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect_err("blank arg is invalid");

        assert_eq!(error, "mcp_fabric_server_arg_invalid:sonar-site-loop");
    }

    #[test]
    fn trims_server_args() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "args": [" site-loop.mjs "],
                  "tools": ["site_loop_status"]
                }
              }
            }"#,
        )
        .expect("trimmed args config parses");

        assert_eq!(
            client.servers["sonar-site-loop"].args,
            vec!["site-loop.mjs"]
        );
    }

    #[test]
    fn rejects_blank_surface_id() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"],
                  "surface_id": " "
                }
              }
            }"#,
        )
        .expect_err("blank surface id is invalid");

        assert_eq!(
            error,
            "mcp_fabric_server_surface_id_invalid:sonar-site-loop"
        );
    }

    #[test]
    fn rejects_blank_target_site_root() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"],
                  "target_site_root": " "
                }
              }
            }"#,
        )
        .expect_err("blank target site root is invalid");

        assert_eq!(
            error,
            "mcp_fabric_server_target_site_root_invalid:sonar-site-loop"
        );
    }

    #[test]
    fn trims_optional_server_metadata() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"],
                  "surface_id": " sonar.surface ",
                  "target_site_root": " D:/code/narada.sonar "
                }
              }
            }"#,
        )
        .expect("trimmed optional metadata config parses");

        let server = &client.servers["sonar-site-loop"];
        assert_eq!(server.surface_id.as_deref(), Some("sonar.surface"));
        assert_eq!(
            server.target_site_root.as_deref(),
            Some("D:/code/narada.sonar")
        );
    }

    #[test]
    fn rejects_ambiguous_tool_list_fields() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status"],
                  "allowed_tools": ["site_loop_run_once"]
                }
              }
            }"#,
        )
        .expect_err("ambiguous tool list fields are invalid");

        assert_eq!(
            error,
            "mcp_fabric_server_tool_list_ambiguous:sonar-site-loop"
        );
    }

    #[test]
    fn rejects_invalid_tool_list_shape() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": "site_loop_status"
                }
              }
            }"#,
        )
        .expect_err("tool list must be an array");

        assert_eq!(
            error,
            "mcp_fabric_server_tool_list_invalid:sonar-site-loop:tools"
        );
    }

    #[test]
    fn rejects_server_without_visible_tools() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node"
                }
              }
            }"#,
        )
        .expect_err("server without visible tools is invalid");

        assert_eq!(error, "mcp_fabric_server_tools_missing:sonar-site-loop");
    }

    #[test]
    fn rejects_blank_visible_tool_name() {
        let error = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": ["site_loop_status", " "]
                }
              }
            }"#,
        )
        .expect_err("blank visible tool name is invalid");

        assert_eq!(error, "mcp_fabric_server_tool_name_invalid:sonar-site-loop");
    }

    #[test]
    fn trims_visible_tool_names() {
        let client = McpFabricTransportClient::from_json_str(
            "fixture.mcp.json",
            r#"{
              "mcpServers": {
                "sonar-site-loop": {
                  "transport": "stdio",
                  "command": "node",
                  "tools": [" site_loop_status "]
                }
              }
            }"#,
        )
        .expect("trimmed tool config parses");

        assert!(client.tool_to_server.contains_key("site_loop_status"));
        assert!(!client.tool_to_server.contains_key(" site_loop_status "));
    }

    #[test]
    fn derives_admitted_boundary_from_configured_tools() {
        let client = McpFabricTransportClient::from_json_str("fixture.mcp.json", config_json())
            .expect("config parses");
        let boundary = client.admitted_boundary(
            "D:/code/narada.sonar/.ai/mcp",
            "fixture.mcp.json:mcpServers",
        );

        assert!(boundary.assert_tool_access("site_loop_run_once").is_ok());
        assert_eq!(
            boundary
                .assert_tool_access("shell_exec")
                .expect_err("not visible"),
            "mcp_tool_not_visible:shell_exec:fixture.mcp.json:mcpServers"
        );
    }

    #[test]
    fn prepares_tool_call_without_spawning_transport() {
        let client = McpFabricTransportClient::from_json_str("fixture.mcp.json", config_json())
            .expect("config parses");
        let boundary = client.admitted_boundary(
            "D:/code/narada.sonar/.ai/mcp",
            "fixture.mcp.json:mcpServers",
        );
        let call = client
            .prepare_tool_call(
                &boundary,
                &McpToolRequest {
                    tool_name: "site_loop_run_once".to_string(),
                    arguments_summary: "{}".to_string(),
                    arguments_ref: None,
                    requesting_agent_id: "sonar.resident".to_string(),
                },
                serde_json::json!({}),
                7,
                &context(),
                "session_event_tool_request_1",
                "2026-05-30T00:00:00.000Z",
            )
            .expect("tool call prepared");

        assert_eq!(call.server_name, "sonar-site-loop");
        assert_eq!(call.command, "node");
        assert_eq!(call.args, vec!["site-loop.mjs".to_string()]);
        assert_eq!(call.tool_name, "site_loop_run_once");
        assert_eq!(call.json_rpc.request.method, "tools/call");
        assert!(call.json_rpc.request_line.contains("\"id\":7"));
        assert_eq!(
            call.request_event.event_kind,
            SessionEventKind::ToolCallRequested
        );
    }

    #[test]
    fn rejects_unconfigured_tools_even_when_boundary_would_allow_them() {
        let client = McpFabricTransportClient::from_json_str("fixture.mcp.json", config_json())
            .expect("config parses");
        let boundary = McpFabricBoundary::admitted(McpFabricPolicy::from_allowed_tools(
            "D:/code/narada.sonar/.ai/mcp",
            "manual_test_policy",
            ["task_lifecycle_next"],
        ));

        let error = client
            .prepare_tool_call(
                &boundary,
                &McpToolRequest {
                    tool_name: "task_lifecycle_next".to_string(),
                    arguments_summary: "{}".to_string(),
                    arguments_ref: None,
                    requesting_agent_id: "sonar.resident".to_string(),
                },
                serde_json::json!({}),
                8,
                &context(),
                "session_event_tool_request_2",
                "2026-05-30T00:00:00.000Z",
            )
            .expect_err("transport config rejects missing tool");

        assert_eq!(error, "mcp_fabric_tool_not_configured:task_lifecycle_next");
    }
}
