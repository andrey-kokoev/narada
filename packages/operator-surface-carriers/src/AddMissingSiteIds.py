import json

path = r"C:\Users\Andrey\Narada\operator-surfaces\identities.json"

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

for identity in data["identities"]:
    if "site_id" not in identity or not identity["site_id"]:
        if "narada_site_relation" in identity and identity["narada_site_relation"].get("site_id"):
            identity["site_id"] = identity["narada_site_relation"]["site_id"]

if "roles" not in data:
    data["roles"] = {}

if "workspace" not in data["roles"]:
    data["roles"]["workspace"] = {"label": "Workspace", "affinity_color": "C084FC"}

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

for identity in data["identities"]:
    print("{} | site_id={}".format(identity["identity_id"], identity.get("site_id", "MISSING")))

print("\nRoles: " + ", ".join(data["roles"].keys()))
