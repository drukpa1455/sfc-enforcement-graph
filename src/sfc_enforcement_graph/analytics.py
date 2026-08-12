from __future__ import annotations

import hashlib
from collections import deque
from typing import Any

BRIDGE_SAMPLES = 64


def add_metrics(nodes: dict[str, dict[str, Any]], links: list[dict[str, Any]]) -> None:
    adjacency = {id: set() for id in nodes}
    excluded = {
        id for id, node in nodes.items()
        if node["kind"] == "release" or is_authority_hub(node)
    }
    for edge in links:
        source, target = edge["source"], edge["target"]
        if edge["family"] == "evidence" or source == target or source in excluded or target in excluded:
            continue
        adjacency[source].add(target)
        adjacency[target].add(source)

    component_sizes = components(adjacency)
    ranks = pagerank(adjacency)
    bridges = bridge_scores(adjacency)
    for id, node in nodes.items():
        node["metrics"] = {
            "degree": len(adjacency[id]),
            "releaseCount": len(node["releaseRefs"]),
            "componentSize": component_sizes[id],
            "pagerank": ranks[id],
            "bridge": bridges[id],
        }


def components(adjacency: dict[str, set[str]]) -> dict[str, int]:
    sizes: dict[str, int] = {}
    unseen = set(adjacency)
    while unseen:
        start = min(unseen)
        component = {start}
        queue = deque([start])
        unseen.remove(start)
        while queue:
            for neighbor in sorted(adjacency[queue.popleft()]):
                if neighbor not in unseen:
                    continue
                unseen.remove(neighbor)
                component.add(neighbor)
                queue.append(neighbor)
        for id in component:
            sizes[id] = len(component)
    return sizes


def pagerank(adjacency: dict[str, set[str]], iterations: int = 24, damping: float = 0.85) -> dict[str, float]:
    active = sorted(id for id, neighbors in adjacency.items() if neighbors)
    if not active:
        return {id: 0.0 for id in adjacency}
    ranks = {id: 1 / len(active) for id in active}
    for _ in range(iterations):
        updated = {id: (1 - damping) / len(active) for id in active}
        for id in active:
            share = damping * ranks[id] / len(adjacency[id])
            for neighbor in sorted(adjacency[id]):
                updated[neighbor] += share
        ranks = updated
    return {id: round(ranks.get(id, 0.0), 10) for id in adjacency}


def bridge_scores(adjacency: dict[str, set[str]]) -> dict[str, float]:
    active = sorted(id for id, neighbors in adjacency.items() if neighbors)
    sources = sorted(active, key=lambda id: hashlib.sha256(id.encode()).digest())[:BRIDGE_SAMPLES]
    scores = {id: 0.0 for id in adjacency}
    for source in sources:
        stack: list[str] = []
        predecessors = {id: [] for id in active}
        paths = {id: 0.0 for id in active}
        distance = {id: -1 for id in active}
        paths[source] = 1.0
        distance[source] = 0
        queue = deque([source])
        while queue:
            current = queue.popleft()
            stack.append(current)
            for neighbor in sorted(adjacency[current]):
                if distance[neighbor] < 0:
                    distance[neighbor] = distance[current] + 1
                    queue.append(neighbor)
                if distance[neighbor] == distance[current] + 1:
                    paths[neighbor] += paths[current]
                    predecessors[neighbor].append(current)
        dependency = {id: 0.0 for id in active}
        while stack:
            current = stack.pop()
            for predecessor in predecessors[current]:
                dependency[predecessor] += paths[predecessor] / paths[current] * (1 + dependency[current])
            if current != source:
                scores[current] += dependency[current]
    maximum = max(scores.values(), default=0)
    return {id: round(score / maximum, 8) if maximum else 0.0 for id, score in scores.items()}


def is_authority_hub(node: dict[str, Any]) -> bool:
    involvement = node["facets"].get("involvement", [])
    return "subject" not in involvement and (
        "authority" in involvement or len(node["releaseRefs"]) > 10
    )
