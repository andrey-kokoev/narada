# @narada2/windows-osl

Descriptor contracts for Windows Operator Surface Label overlay package adoption.

This package models label projection, panel payload, and install/start/stop/inspect request descriptors. It does not import generated window labels, live runtime bindings, PC-locus installs, or live window evidence.

## OSL Panel Payload

The `narada.operator_surface.osl_panel_payload.v0` contract models a read-only WebView2 panel payload assembled from receiving-Site supplied projection data. It carries source surface, identity summary, capability projection, execution policy, authority posture, activity, presentation hints, and an empty `future_controls` list.

Validation refuses payloads that grant shell-like authority, add visible controls without separate admission, or treat external evidence as local projection authority. The package does not open WebView2, install a panel host, mutate PC state, or import source Site runtime payloads.
