"""Tests for utils/outlet_code.py - code generation format and cross-run persistence."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.outlet_code import generate_outlet_code, slugify, get_type_abbrev, parse_outlet_code


class TestSlugify:
    def test_basic_name(self):
        assert slugify("TechCrunch") == "techcrunch"

    def test_name_with_spaces(self):
        assert slugify("The New York Times") == "the-new-york-times"

    def test_unicode_normalization(self):
        result = slugify("Expressen Noje")
        assert result == "expressen-noje"

    def test_max_length_truncation(self):
        long_name = "A" * 50
        result = slugify(long_name, max_length=30)
        assert len(result) <= 30

    def test_strips_special_chars(self):
        assert slugify("CNN (US)") == "cnn-us"

    def test_collapses_multiple_hyphens(self):
        assert slugify("foo---bar") == "foo-bar"


class TestGetTypeAbbrev:
    def test_known_types(self):
        assert get_type_abbrev("tv") == "tv"
        assert get_type_abbrev("magazine") == "mag"
        assert get_type_abbrev("podcast") == "pod"
        assert get_type_abbrev("youtube") == "yt"
        assert get_type_abbrev("blog") == "blog"
        assert get_type_abbrev("newspaper") == "news"
        assert get_type_abbrev("trade publication") == "trade"

    def test_unknown_type_returns_other(self):
        assert get_type_abbrev("foobar") == "other"

    def test_case_insensitive(self):
        assert get_type_abbrev("TV") == "tv"
        assert get_type_abbrev("Magazine") == "mag"


class TestGenerateOutletCode:
    def test_basic_format(self):
        code = generate_outlet_code("us", "blog", "TechCrunch", run_number=1)
        assert code == "us-blog-techcrunch"

    def test_run_number_ignored(self):
        """Run number should NOT appear in the code - cross-run persistence."""
        code1 = generate_outlet_code("us", "tv", "CNN", run_number=1)
        code2 = generate_outlet_code("us", "tv", "CNN", run_number=5)
        assert code1 == code2
        assert "-r" not in code1

    def test_country_code_truncated(self):
        code = generate_outlet_code("usa", "blog", "Test", run_number=1)
        assert code.startswith("us-")

    def test_type_abbreviation_applied(self):
        code = generate_outlet_code("uk", "magazine", "Vogue", run_number=1)
        assert code.startswith("uk-mag-")


class TestParseOutletCode:
    def test_parse_new_format(self):
        result = parse_outlet_code("us-blog-techcrunch")
        assert result["country"] == "us"
        assert result["type"] == "blog"
        assert result["slug"] == "techcrunch"
        assert result["run_number"] == 0

    def test_parse_legacy_format(self):
        result = parse_outlet_code("se-tv-svt-nyheter-r3")
        assert result["country"] == "se"
        assert result["type"] == "tv"
        assert result["slug"] == "svt-nyheter"
        assert result["run_number"] == 3
