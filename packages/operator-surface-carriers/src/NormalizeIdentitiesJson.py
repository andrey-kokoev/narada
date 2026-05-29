import json
import sys

path = r"C:\Users\Andrey\Narada\operator-surfaces\identities.json"

with open(path, "r", encoding="utf-8-sig") as f:
    data = json.load(f)

for identity in data["identities"]:
    # Ensure identity_id exists
    if "identity_id" not in identity:
        identity["identity_id"] = identity.get("identity_name", "")

    # Ensure identity_name exists (backward compatible alias)
    if "identity_name" not in identity:
        identity["identity_name"] = identity["identity_id"]

    # Ensure agent_name exists
    if "agent_name" not in identity:
        name = identity.get("display_name") or identity.get("label") or ""
        if not name:
            parts = identity["identity_id"].split(".", 1)
            name = parts[1] if len(parts) > 1 else identity["identity_id"]
        identity["agent_name"] = name

    # Ensure top-level role exists
    if "role" not in identity and identity.get("role_metadata", {}).get("role"):
        identity["role"] = identity["role_metadata"]["role"]
    elif "role" in identity and "role_metadata" not in identity:
        identity["role_metadata"] = {
            "role": identity["role"],
            "role_is_naming_authority": False,
        }

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

for identity in data["identities"]:
    print("{} | name={} | agent={} | role={}".format(
        identity["identity_id"],
        identity["identity_name"],
        identity["agent_name"],
        identity.get("role", ""),
    ))
