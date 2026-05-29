#!/usr/bin/env python3
"""
Extract meta-architectural arcs from a Codex conversation chapter.

Traces invariant evolution across turns, annotates commitment levels,
clusters duplicates, cross-references concepts, and emits both structured
JSON and readable markdown.

Usage:
    python extract_meta_arc.py \
        ./chapters/20260425-narada-andrey-architect-evolution.md \
        ./chapters/20260425-narada-andrey-meta-arc
"""
import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import Any


TURN_RE = re.compile(r"^### Turn (\d+) .+?\n", re.MULTILINE)
SECTION_RE = re.compile(r"^\*\*(User Intent|Architect Response|Architect Commentary):\*\*\n", re.MULTILINE)

# Commitment language patterns, ordered from weakest to strongest
COMMITMENT_LEVELS = [
    ("doctrinal", re.compile(r"\b(doctrinal|doctrine|structural|invariant|core|AGENTS\.md|/thoughts/content/concepts)\b", re.I)),
    ("implemented", re.compile(r"\b(committed|pushed|done\.|created|added|set up|installed|merged|closed task|verified)\b", re.I)),
    ("agreed", re.compile(r"\b(yes\.|agreed|let's do|decided|proceed|do it|nice\.|good\.)\b", re.I)),
    ("draft", re.compile(r"\b(I think|probably|could|might|suggest|proposal|perhaps|maybe|would|should consider)\b", re.I)),
]


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", "", text.lower())


def _extract_signature(text: str) -> set[str]:
    """Extract key noun phrases for clustering."""
    sig = set()
    # Look for specific architectural terms
    for m in re.finditer(r"\b(user site|pc site|CIPDA|cipda|title matching|diagnostic|overlay|komorebi|yasb|inbox|outbox|mailbox|sqlite|task lifecycle|operator surface|identity binding|work locus|display swap|desktop|workspace|shortcut|icon|repair script|border|window label|ahk|whkd|staccato|OneDrive|WSL|Windows Terminal|runtime adapter|evidence pipeline|authority|locus|telos|canon|canonical|embodiment|de-arbitrization|constructively invariant|progressive de-arbitrization|scale-relative|directed obligation|review pickup|obligation dispatcher|window surface overlay)\b", text, re.I):
        sig.add(m.group(1).lower().replace(" ", "_"))
    return sig

def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _extract_name(text: str, user_text: str) -> str:
    """Extract a meaningful name from response text or user intent."""
    # 1. Look for bolded phrases
    bold = re.search(r"\*\*([^*]{10,80})\*\*", text)
    if bold:
        return bold.group(1).strip()

    # 2. Look for quoted concepts
    quoted = re.search(r'["`]([^"`]{10,80})["`]', text)
    if quoted:
        return quoted.group(1).strip()

    # 3. Use user intent if it's a short directive
    user_clean = user_text.strip()
    if 5 < len(user_clean) < 120:
        return user_clean[:120]

    # 4. First sentence, but drop leading agreement words
    first = text.split(".")[0].strip()
    first = re.sub(r"^(Yes|No|Agreed|Done|Proceed|Nice|Good)\b[,\.]?\s*", "", first, flags=re.I)
    if len(first) > 10:
        return first[:120]

    return text[:80].strip()


def _commitment_level(text: str) -> str:
    """Return the strongest commitment level detected."""
    for level, pat in COMMITMENT_LEVELS:
        if pat.search(text):
            return level
    return "draft"


@dataclass
class ArcItem:
    category: str
    name: str
    formulation: str
    commitment_level: str
    turn_range: tuple[int, int]
    turns: list[int] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    referenced_concepts: list[str] = field(default_factory=list)
    related_items: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["turn_range"] = list(self.turn_range)
        return d


def split_turns(text: str) -> list[dict[str, Any]]:
    parts = TURN_RE.split(text)
    turns = []
    for i, raw in enumerate(parts[1:], start=1):
        match = re.match(r"(\d+)\s+[-\u2014]\s+(.+?)\n", raw[:200])
        turn_num = int(match.group(1)) if match else i
        timestamp = match.group(2) if match else ""

        turn = {
            "turn_num": turn_num,
            "timestamp": timestamp,
            "sections": defaultdict(str),
        }
        current_key = "preamble"
        current_lines = []
        for line in raw.splitlines(keepends=True):
            m = SECTION_RE.match(line)
            if m:
                turn["sections"][current_key] = "".join(current_lines).strip()
                current_key = m.group(1).lower().replace(" ", "_")
                current_lines = []
            else:
                current_lines.append(line)
        turn["sections"][current_key] = "".join(current_lines).strip()
        turns.append(turn)
    return turns


def _score_items(turns: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Score each turn for the four categories and return candidates."""
    candidates: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for turn in turns:
        response = turn["sections"].get("architect_response", "")
        commentary = turn["sections"].get("architect_commentary", "")
        user = turn["sections"].get("user_intent", "")
        combined = f"{user}\n{response}\n{commentary}"
        turn_num = turn["turn_num"]

        # Invariant detection
        inv_score = 0
        inv_score += 15 * len(re.findall(r"\bbecame (structural|doctrinal|core|explicit)\b", combined, re.I))
        inv_score += 10 * len(re.findall(r"\b(before,? .+? now,? |was .+? now )", combined, re.I))
        inv_score += 10 * len(re.findall(r"\b(decided|decision|commitment|invariant)\b", combined, re.I))
        inv_score += 8 * len(re.findall(r"\b(the coherent model is|that means)\b", combined, re.I))
        inv_score += 5 * len(re.findall(r"\b(agreed|agreement|consensus)\b", combined, re.I))
        if inv_score > 0:
            candidates["invariant"].append({
                "turn": turn_num,
                "user": user[:300],
                "text": response[:1200],
                "score": inv_score,
            })

        # Open thread detection
        open_score = 0
        open_score += 15 * len(re.findall(r"\bremaining (incoherence|friction|issue|work)\b", combined, re.I))
        open_score += 10 * len(re.findall(r"\b(open question|open thread|not yet|pending)\b", combined, re.I))
        open_score += 8 * len(re.findall(r"\b(still need|still missing|still open)\b", combined, re.I))
        open_score += 5 * len(re.findall(r"\b(next[,:]|where next|what next)\b", combined, re.I))
        open_score += 5 * len(re.findall(r"\b(todo|fixme|hack|workaround)\b", combined, re.I))
        if open_score > 0:
            candidates["open"].append({
                "turn": turn_num,
                "user": user[:300],
                "text": response[:1200],
                "score": open_score,
            })

        # Concept detection
        concept_score = 0
        concept_score += 20 * len(re.findall(r"\b(cipda|constructively invariant progressive de-arbitrization)\b", combined, re.I))
        concept_score += 15 * len(re.findall(r"\b(inhabited evolution)\b", combined, re.I))
        concept_score += 10 * len(re.findall(r"\b(de-arbitrization|dearbitrization)\b", combined, re.I))
        concept_score += 10 * len(re.findall(r"\b(i call this|this concept is|is defined as)\b", combined, re.I))
        concept_score += 8 * len(re.findall(r"\b(telos|locus|canonical|doctrine)\b", combined, re.I))
        if concept_score > 0:
            candidates["concept"].append({
                "turn": turn_num,
                "user": user[:300],
                "text": response[:1200],
                "score": concept_score,
            })

        # Tension detection
        tension_score = 0
        tension_score += 15 * len(re.findall(r"\b(unresolved tension|tradeoff|trade-off)\b", combined, re.I))
        tension_score += 10 * len(re.findall(r"\b(incoherence|incoherent)\b", combined, re.I))
        tension_score += 8 * len(re.findall(r"\b(friction|frictional)\b", combined, re.I))
        tension_score += 5 * len(re.findall(r"\b(fails?|broken|crash|bug|regression|observed .+? issue|observed .+? problem)\b", combined, re.I))
        if tension_score > 0:
            candidates["tension"].append({
                "turn": turn_num,
                "user": user[:300],
                "text": response[:1200],
                "score": tension_score,
            })

    return candidates


def _cluster(candidates: list[dict[str, Any]], min_score: int = 10) -> list[ArcItem]:
    """Cluster candidates by semantic signature and merge into ArcItems."""
    filtered = [c for c in candidates if c["score"] >= min_score]
    filtered.sort(key=lambda x: -x["score"])

    clusters: list[ArcItem] = []

    for cand in filtered:
        sig = _extract_signature(cand["text"])
        if not sig:
            sig = _extract_signature(cand["user"])
        if not sig:
            # Fallback: use first sentence as name
            name = cand["text"].split(".")[0][:80]
            sig = {_normalize(name)}

        # Try to merge into existing cluster
        merged = False
        for cluster in clusters:
            cluster_sig = _extract_signature(cluster.formulation)
            if not cluster_sig:
                cluster_sig = {_normalize(cluster.name)}
            # Require meaningful overlap: Jaccard > 0.3 or at least 2 shared specific terms
            similarity = _jaccard(sig, cluster_sig)
            if similarity >= 0.3 or (len(sig & cluster_sig) >= 2 and similarity > 0):
                # Merge
                cluster.turns.append(cand["turn"])
                cluster.turn_range = (min(cluster.turn_range[0], cand["turn"]),
                                      max(cluster.turn_range[1], cand["turn"]))
                cluster.sources.append(cand["text"][:400])
                # Upgrade commitment level if stronger
                new_level = _commitment_level(cand["text"])
                level_order = ["draft", "agreed", "implemented", "doctrinal"]
                if level_order.index(new_level) > level_order.index(cluster.commitment_level):
                    cluster.commitment_level = new_level
                    cluster.formulation = cand["text"][:800]
                merged = True
                break

        if not merged:
            # Try to extract a meaningful name
            name = _extract_name(cand["text"], cand["user"])
            level = _commitment_level(cand["text"])
            clusters.append(ArcItem(
                category="",
                name=name,
                formulation=cand["text"][:800],
                commitment_level=level,
                turn_range=(cand["turn"], cand["turn"]),
                turns=[cand["turn"]],
                sources=[cand["text"][:400]],
            ))

    return clusters


def _cross_reference(invariants: list[ArcItem], concepts: list[ArcItem],
                     opens: list[ArcItem], tensions: list[ArcItem]) -> None:
    """Link related items across categories."""
    all_items = invariants + concepts + opens + tensions
    name_index: dict[str, ArcItem] = {}
    for item in all_items:
        key = _normalize(item.name)
        name_index[key] = item

    for item in all_items:
        sig = _extract_signature(item.formulation)
        for other in all_items:
            if other is item:
                continue
            other_sig = _extract_signature(other.formulation)
            if sig & other_sig:
                other_key = _normalize(other.name)
                if other_key not in item.related_items:
                    item.related_items.append(other_key)


def _clean_markdown(text: str) -> str:
    """Strip markdown formatting for plain-text consumption."""
    # Remove links [text](url)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove bold/italic
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    # Remove backticks
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove code blocks
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Collapse newlines
    text = " ".join(text.split())
    return text.strip()


def _is_actionable_thread(item: ArcItem) -> bool:
    text = item.formulation.lower()
    return bool(re.search(r"\b(task|next|need|should|must|pending|deferred|open|not yet|still|missing|uncommitted|unresolved)\b", text))


def _is_active_tension(item: ArcItem) -> bool:
    text = item.formulation.lower()
    if re.search(r"\b(was fixed|has been resolved|no longer|previously|had been|used to)\b", text):
        return False
    return bool(re.search(r"\b(remaining|still|currently|observed|fails?|broken|crash|bug|regression|incoherence|incoherent|friction|tension|conflict)\b", text))


def _is_quality_name(name: str) -> bool:
    """Filter out junk names like paths, IDs, or fragment labels."""
    if len(name) < 15:
        return False
    if len(name.split()) < 3:
        return False
    if re.search(r"^[A-Z]:\\|env_[a-f0-9]|\\.md[)>]|Architect Commentary", name):
        return False
    if name.count(".") > 5 and " " not in name:
        return False
    return True


def emit_operator_card(invariants: list[ArcItem], concepts: list[ArcItem],
                       opens: list[ArcItem], tensions: list[ArcItem],
                       output_path: str) -> None:
    lines = []
    lines.append("# Operator Card: narada-andrey.architect")
    lines.append("")
    lines.append("*Auto-generated from meta-arc. Read at session start. Consult full arc for provenance.*")
    lines.append("")

    # 1. Invariants
    firm = [i for i in invariants if i.commitment_level in {"doctrinal", "implemented"}]
    lines.append("## Invariants (do not violate)")
    lines.append("")
    if not firm:
        lines.append("*No firm invariants detected.*")
    for idx, item in enumerate(firm[:10], 1):
        name = _clean_markdown(item.name)
        if not name or len(name) < 10:
            name = _clean_markdown(item.formulation.split(".")[0])[:120]
        name = name[:200]
        lines.append(f"{idx}. {name}")
    lines.append("")

    # 2. Open Threads
    actionable = [o for o in opens if _is_actionable_thread(o) and _is_quality_name(o.name)]
    lines.append("## Open Threads (active)")
    lines.append("")
    if not actionable:
        lines.append("*No actionable open threads detected.*")
    for item in actionable[:10]:
        name = _clean_markdown(item.name)
        name = name[:180]
        lines.append(f"- [ ] {name}")
    lines.append("")

    # 3. Vocabulary
    lines.append("## Vocabulary")
    lines.append("")
    good_concepts = [c for c in concepts if _is_quality_name(c.name)]
    if not good_concepts:
        lines.append("*No concepts detected.*")
    for item in good_concepts[:10]:
        name = _clean_markdown(item.name)
        name = name[:60]
        definition = _clean_markdown(item.formulation.split(".")[0])
        definition = definition[:160]
        if len(definition) > 160:
            definition = definition[:157] + "..."
        lines.append(f"- **{name}**: {definition}")
    lines.append("")

    # 4. Active Tensions
    active = [t for t in tensions if _is_active_tension(t) and _is_quality_name(t.name)]
    lines.append("## Active Tensions")
    lines.append("")
    if not active:
        lines.append("*No active tensions detected.*")
    for idx, item in enumerate(active[:8], 1):
        name = _clean_markdown(item.name)
        if not name or len(name) < 10:
            name = _clean_markdown(item.formulation.split(".")[0])[:160]
        name = name[:200]
        lines.append(f"{idx}. {name}")
    lines.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Operator card: {output_path}")


def extract(input_path: str, output_prefix: str, operator_card: bool = False) -> None:
    with open(input_path, "r", encoding="utf-8") as f:
        text = f.read()

    turns = split_turns(text)
    candidates = _score_items(turns)

    invariants = _cluster(candidates["invariant"], min_score=15)
    concepts = _cluster(candidates["concept"], min_score=15)
    opens = _cluster(candidates["open"], min_score=10)
    tensions = _cluster(candidates["tension"], min_score=10)

    for item in invariants:
        item.category = "invariant"
    for item in concepts:
        item.category = "concept"
    for item in opens:
        item.category = "open"
    for item in tensions:
        item.category = "tension"

    _cross_reference(invariants, concepts, opens, tensions)

    # Deduplicate by name
    def dedup(items: list[ArcItem]) -> list[ArcItem]:
        seen: dict[str, ArcItem] = {}
        for item in items:
            key = _normalize(item.name)
            if key in seen:
                # Merge
                old = seen[key]
                old.turns.extend(item.turns)
                old.turn_range = (min(old.turn_range[0], item.turn_range[0]),
                                  max(old.turn_range[1], item.turn_range[1]))
                old.sources.extend(item.sources)
            else:
                seen[key] = item
        return list(seen.values())

    invariants = dedup(invariants)
    concepts = dedup(concepts)
    opens = dedup(opens)
    tensions = dedup(tensions)

    # Sort by turn range (earliest first)
    invariants.sort(key=lambda x: x.turn_range[0])
    concepts.sort(key=lambda x: x.turn_range[0])
    opens.sort(key=lambda x: x.turn_range[0])
    tensions.sort(key=lambda x: x.turn_range[0])

    # Write JSON
    json_path = output_prefix + ".json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "invariants": [i.to_dict() for i in invariants],
            "concepts": [i.to_dict() for i in concepts],
            "open_threads": [i.to_dict() for i in opens],
            "tensions": [i.to_dict() for i in tensions],
        }, f, indent=2, ensure_ascii=False)

    # Write Markdown
    md_path = output_prefix + ".md"
    lines = []
    lines.append("# Meta-Arc: Narada-Andrey.Architect")
    lines.append("")
    lines.append("*Auto-extracted from conversation chapter. Invariants are clustered and deduplicated; commitment levels are inferred from language.*")
    lines.append("")

    def write_section(title: str, items: list[ArcItem]) -> None:
        lines.append(f"## {title}")
        lines.append("")
        if not items:
            lines.append("*None detected.*")
            lines.append("")
            return
        for item in items:
            lines.append(f"### {item.name}")
            lines.append("")
            lines.append(f"- **Commitment:** `{item.commitment_level}`")
            lines.append(f"- **Turns:** {item.turn_range[0]}{f'–{item.turn_range[1]}' if item.turn_range[1] != item.turn_range[0] else ''}")
            if item.related_items:
                lines.append(f"- **Related:** {', '.join(item.related_items[:5])}")
            lines.append("")
            lines.append(item.formulation)
            lines.append("")
            if len(item.sources) > 1:
                lines.append("**Evolution trace:**")
                for idx, src in enumerate(item.sources[:3], 1):
                    lines.append(f"{idx}. {src[:200]}{'...' if len(src) > 200 else ''}")
                lines.append("")
        lines.append("")

    write_section("1. Established Invariants", invariants)
    write_section("2. Conceptual Vocabulary", concepts)
    write_section("3. Open Threads", opens)
    write_section("4. Unresolved Tensions", tensions)

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    if operator_card:
        card_path = output_prefix + ".architect-card.md"
        emit_operator_card(invariants, concepts, opens, tensions, card_path)

    print(f"Turns scanned: {len(turns)}")
    print(f"Invariants: {len(invariants)}")
    print(f"Concepts: {len(concepts)}")
    print(f"Open threads: {len(opens)}")
    print(f"Tensions: {len(tensions)}")
    print(f"JSON: {json_path}")
    print(f"Markdown: {md_path}")
    if operator_card:
        print(f"Operator card: {output_prefix}.operator-card.md")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract synthesized meta-architectural arcs")
    parser.add_argument("input", help="Input .md chapter path")
    parser.add_argument("output_prefix", help="Output path prefix (no extension)")
    parser.add_argument(
        "--operator-card",
        action="store_true",
        help="Emit a concise operator card instead of the full arc",
    )
    args = parser.parse_args()
    extract(args.input, args.output_prefix, operator_card=args.operator_card)


if __name__ == "__main__":
    main()
