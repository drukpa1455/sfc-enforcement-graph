# Using the graph

## Read the workspace

The complete graph opens beside the research agent. Use **Overview** when you
want a quieter recent slice.

- **Show all / Overview** changes the graph scope without changing canonical data.
- **Key** explains node shapes and edge styles; every row is also a filter.
- **Reset** restores all node and edge families after filtering.
- **Graph, split, and agent** controls change layout without losing context.
- **Sun / moon** switches between Jade light and Sapphire dark themes.

Node shapes carry stable families: sources, entities, matters, risks, and
actions. Edge color and dash patterns distinguish evidence, participation, and
explicit relationships.

## Inspect evidence

Select a node to open its summary, facets, facts, metrics, and source releases
inside the graph. Select an edge to inspect its direction, type, evidence quote,
and source release. Release links open the original SFC publication. Suggested
questions adapt to the selected node or edge and prefill the agent composer for
review before sending.

The selection ring means selected, not implicated. A line means the source
supports that exact typed relationship; it does not license a broader inference.

## Ask the agent

Useful requests include:

```text
Find Futu Securities and show its direct connections.
Show the highest recurring people in the graph.
Show the people with the highest betweenness centrality.
Trace the relationship between these two selected nodes.
Expand this view by two hops without authority hubs.
Show this entity's community and connected component.
Which releases support this action?
```

Agent tools can search, inspect, expand, rank, trace paths, and traverse bounded
neighborhoods, communities, and components without moving the canvas mid-search.
One final show action synchronizes each concrete graph answer with the canvas.
A single subject opens with its direct relationships; an assembled result keeps
its exact node set. That focus remains reversible: use **Show all** or
**Overview** to leave it. Current Key filters are sent with the chat context, so
“this view” means the same visible node kinds and edge families the user sees.
Completed tool payloads are removed from later requests while recent
conversational text is retained, keeping multi-turn research bounded.

| Question | Structural operation |
|---|---|
| Who appears most often? | Release-count ranking |
| Who is highly connected or influential? | Degree or PageRank ranking |
| Who bridges otherwise separate regions? | Betweenness ranking |
| Who sits in a dense subgraph? | k-core ranking |
| Which nodes form an algorithmic cluster? | Louvain community |
| What is reachable at any distance? | Connected component |
| How are two entities connected? | Shortest evidence-backed path |

## Interpret cautiously

The interface preserves statuses such as reported, suspected, alleged, found,
convicted, ordered, and sought. Keep those distinctions when reading a path or
metric. Centrality describes graph structure, not culpability, importance, or
investment significance.
