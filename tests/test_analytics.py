from sfc_enforcement_graph.analytics import add_metrics


def test_metrics_use_semantic_topology_without_authority_hubs() -> None:
    nodes = {
        "left": node("person", ["subject"]),
        "bridge": node("organization", ["subject"]),
        "right": node("person", ["subject"]),
        "authority": node("organization", ["authority"]),
        "release": node("release", []),
    }
    links = [
        edge("left", "bridge", "relationship"),
        edge("bridge", "right", "participation"),
        edge("authority", "bridge", "participation"),
        edge("release", "left", "evidence"),
    ]

    add_metrics(nodes, links)

    assert nodes["bridge"]["metrics"]["degree"] == 2
    assert nodes["bridge"]["metrics"]["componentSize"] == 3
    assert nodes["bridge"]["metrics"]["bridge"] == 1
    assert nodes["bridge"]["metrics"]["pagerank"] > nodes["left"]["metrics"]["pagerank"]
    assert nodes["authority"]["metrics"]["degree"] == 0
    assert nodes["release"]["metrics"]["degree"] == 0


def node(kind: str, involvement: list[str]) -> dict:
    return {"kind": kind, "releaseRefs": ["sample"], "facets": {"involvement": involvement}}


def edge(source: str, target: str, family: str) -> dict:
    return {"source": source, "target": target, "family": family}
