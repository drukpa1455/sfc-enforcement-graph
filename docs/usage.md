# Using the graph

## Read the workspace

The graph opens as a recent overview beside the research agent.

- **Show all / Overview** changes the graph scope without changing canonical data.
- **Labels** shows or hides dynamic node labels.
- **Key** explains node shapes and edge styles; every row is also a filter.
- **Reset** restores all node and edge families after filtering.
- **Graph, split, and agent** controls change layout without losing context.
- **Sun / moon** switches between Jade light and Sapphire dark themes.

Node shapes carry stable families: sources, entities, matters, risks, and
actions. Edge color and dash patterns distinguish evidence, participation, and
explicit relationships.

## Inspect evidence

Select a node to see its summary, facets, facts, metrics, and source releases in
the agent panel. Select an edge to inspect its direction, type, evidence quote,
and source release. Release links open the original SFC publication.

The selection ring means selected, not implicated. A line means the source
supports that exact typed relationship; it does not license a broader inference.

## Ask the agent

Useful requests include:

```text
Find Futu Securities and show its direct connections.
Show the highest recurring people in the graph.
Trace the relationship between these two selected nodes.
Expand this view by two hops without authority hubs.
Which releases support this action?
```

Agent tools can search, inspect, rank, trace, expand, show components or
communities, and focus the graph. A
focused result remains reversible: use **Show all** or **Overview** to leave it.
Current Key filters are sent with the chat context, so “this view” means the
same visible node kinds and edge families the user sees.

## Interpret cautiously

The interface preserves statuses such as reported, suspected, alleged, found,
convicted, ordered, and sought. Keep those distinctions when reading a path or
metric. Centrality describes graph structure, not culpability, importance, or
investment significance.
