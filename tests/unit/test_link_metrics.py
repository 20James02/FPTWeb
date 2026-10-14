def test_wilson_keeps_zero_sample_unknown_and_bounds_in_range():
    from pagefpt.modules.link_analytics.metrics import wilson

    assert wilson(0, 0) is None
    lower, upper = wilson(10, 100)
    assert 0 < lower < 0.1 < upper < 1
    assert wilson(101, 100) is None


def test_ranking_does_not_call_one_conversion_a_winner():
    from pagefpt.modules.link_analytics.metrics import rank_measured

    small = rank_measured(1, 1, 1)
    large = rank_measured(100, 50, 30)
    assert small["state"] == "insufficient"
    assert small["score"] is None
    assert large["state"] == "ready"
    assert 0 < large["score"] < 30
    assert large["closed_rate"] == 0.3
