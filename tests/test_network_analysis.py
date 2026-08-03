from app.api.v1 import network_analysis


def _edge(source: str, target: str) -> network_analysis.EdgeIn:
    return network_analysis.EdgeIn(source=source, target=target)


def test_paths_between_returns_all_paths_within_limit() -> None:
    response = network_analysis.paths_between(
        network_analysis.GraphRequest(
            edges=[_edge("a", "b"), _edge("b", "d"), _edge("a", "c"), _edge("c", "d")],
            start_id="a",
            target_id="d",
            max_hops=2,
        )
    )

    assert response == {
        "schema": "mimirq.kg_network_analysis.v1",
        "paths": [["a", "b", "d"], ["a", "c", "d"]],
        "path_count": 2,
        "path_limit": network_analysis._MAX_PATHS,
        "search_steps": 5,
        "path_search_limit": network_analysis._MAX_PATH_SEARCH_STEPS,
        "truncated": False,
    }


def test_paths_between_stops_enumeration_at_path_limit() -> None:
    response = network_analysis.paths_between(
        network_analysis.GraphRequest(
            edges=[
                _edge("a", "b"),
                _edge("b", "z"),
                _edge("a", "c"),
                _edge("c", "z"),
                _edge("a", "d"),
                _edge("d", "z"),
            ],
            start_id="a",
            target_id="z",
            max_hops=2,
            max_paths=2,
        )
    )

    assert response["paths"] == [["a", "b", "z"], ["a", "c", "z"]]
    assert response["path_count"] == 2
    assert response["path_limit"] == 2
    assert response["truncated"] is True


def test_paths_between_stops_search_without_reaching_target(monkeypatch) -> None:
    monkeypatch.setattr(network_analysis, "_MAX_PATH_SEARCH_STEPS", 5)
    response = network_analysis.paths_between(
        network_analysis.GraphRequest(
            edges=[
                _edge("start", "a"),
                _edge("start", "b"),
                _edge("a", "a1"),
                _edge("a", "a2"),
                _edge("b", "b1"),
                _edge("b", "b2"),
            ],
            start_id="start",
            target_id="unreachable",
            max_hops=3,
        )
    )

    assert response["paths"] == []
    assert response["path_count"] == 0
    assert response["path_search_limit"] == 5
    assert response["search_steps"] == 5
    assert response["truncated"] is True


def test_paths_between_caps_dense_graph_enumeration() -> None:
    left_nodes = [f"left-{index:02d}" for index in range(33)]
    right_nodes = [f"right-{index:02d}" for index in range(33)]
    edges = [_edge("start", node) for node in left_nodes]
    edges += [_edge(node, "target") for node in right_nodes]
    edges += [_edge(left, right) for left in left_nodes for right in right_nodes]

    response = network_analysis.paths_between(
        network_analysis.GraphRequest(edges=edges, start_id="start", target_id="target", max_hops=3)
    )

    assert len(response["paths"]) == network_analysis._MAX_PATHS
    assert response["path_count"] == network_analysis._MAX_PATHS
    assert response["truncated"] is True
    assert all(path[0] == "start" and path[-1] == "target" and len(path) == 4 for path in response["paths"])


def test_graph_request_rejects_unbounded_path_limits_and_node_ids() -> None:
    too_long_node_id = "n" * (network_analysis._MAX_NODE_ID_LENGTH + 1)

    try:
        network_analysis.GraphRequest(edges=[], max_paths=network_analysis._MAX_PATHS + 1)
    except ValueError:
        pass
    else:
        raise AssertionError("max_paths 必须受服务端上限约束")

    try:
        network_analysis.EdgeIn(source=too_long_node_id, target="target")
    except ValueError:
        pass
    else:
        raise AssertionError("节点标识长度必须受限")
