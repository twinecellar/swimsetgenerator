#!/usr/bin/env python3
"""Small CLI for exercising the swim plan generate endpoint."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ROUTE = "/v1/plans/generate"
DEFAULT_TIMEOUT_SECONDS = 60
VALID_DURATIONS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
VALID_EFFORTS = ["easy", "medium", "hard"]
VALID_TAGS = [
    "technique",
    "speed",
    "endurance",
    "recovery",
    "fun",
    "steady",
    "freestyle",
    "mixed",
    "kick",
    "fins",
    "pull",
    "paddles",
    "golf",
    "broken",
    "fartlek",
    "time_trial",
    "sprints",
    "hypoxic",
    "underwater",
    "choice",
    "benchmark",
]

PRESETS: dict[str, dict[str, Any]] = {
    "balanced": {
        "duration_minutes": 30,
        "effort": "medium",
        "requested_tags": ["recovery"],
        "regen_attempt": 2
    }
    
}

# Edit these defaults directly if you want to keep a reusable local test setup.
# Any CLI flags you pass will override these values.
SCRIPT_DEFAULTS: dict[str, Any] = {
    "base_url": "http://localhost:3000",
    "url": None,
    "route": DEFAULT_ROUTE,
    "token": "",
    "supabase_url": "",
    "supabase_anon_key": "",
    "email": "",
    "password": "",
    "preset": "balanced",
    "duration": None,
    "effort": None,
    "tags": [],
    "regen_attempt": None,
    "raw_only": False,
    "timeout": DEFAULT_TIMEOUT_SECONDS,
}


def load_dotenv() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue

        cleaned = value.strip().strip("'").strip('"')
        os.environ[key] = cleaned


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a valid payload, call the generate endpoint, and summarize the response."
    )
    parser.add_argument("--base-url", help="Base API URL, e.g. http://localhost:3000")
    parser.add_argument("--url", help="Full endpoint URL. Overrides --base-url/--route.")
    parser.add_argument(
        "--route",
        default=SCRIPT_DEFAULTS["route"],
        help=f"Endpoint route. Default: {SCRIPT_DEFAULTS['route']}",
    )
    parser.add_argument(
        "--token",
        help="Bearer token. Defaults to PLAN_TEST_TOKEN or SUPABASE_ACCESS_TOKEN from the environment.",
    )
    parser.add_argument(
        "--supabase-url",
        help="Supabase project URL. Used to sign in and fetch a token when --token is not provided.",
    )
    parser.add_argument(
        "--supabase-anon-key",
        help="Supabase anon key. Used to sign in and fetch a token when --token is not provided.",
    )
    parser.add_argument(
        "--email",
        help="Supabase auth email. Used to sign in and fetch a token when --token is not provided.",
    )
    parser.add_argument(
        "--password",
        help="Supabase auth password. Used to sign in and fetch a token when --token is not provided.",
    )
    parser.add_argument(
        "--preset",
        choices=sorted(PRESETS.keys()),
        default=SCRIPT_DEFAULTS["preset"],
        help="Starting payload preset.",
    )
    parser.add_argument("--list-presets", action="store_true", help="Print preset payloads and exit.")
    parser.add_argument(
        "--duration",
        type=int,
        choices=VALID_DURATIONS,
        help="Duration minutes override.",
    )
    parser.add_argument("--effort", choices=VALID_EFFORTS, help="Effort override.")
    parser.add_argument(
        "--tag",
        action="append",
        default=None,
        help="Requested tag. Repeat for multiple tags. Replaces preset tags if supplied.",
    )
    parser.add_argument(
        "--regen-attempt",
        type=int,
        help="Optional regenerate attempt integer between 0 and 50.",
    )
    parser.add_argument(
        "--raw-only",
        action="store_true",
        default=SCRIPT_DEFAULTS["raw_only"],
        help="Only print the raw response JSON.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=SCRIPT_DEFAULTS["timeout"],
        help=f"Request timeout in seconds. Default: {SCRIPT_DEFAULTS['timeout']}",
    )
    return parser.parse_args()


def list_presets() -> int:
    print(json.dumps(PRESETS, indent=2))
    return 0


def resolve_url(args: argparse.Namespace) -> str:
    direct_url = args.url or SCRIPT_DEFAULTS["url"]
    if direct_url:
        return direct_url

    base_url = args.base_url or SCRIPT_DEFAULTS["base_url"] or os.environ.get("PLAN_API_BASE_URL") or "http://localhost:3000"
    route = args.route or SCRIPT_DEFAULTS["route"] or DEFAULT_ROUTE
    return f"{base_url.rstrip('/')}/{route.lstrip('/')}"


def resolve_token(args: argparse.Namespace) -> str:
    token = (
        args.token
        or SCRIPT_DEFAULTS["token"]
        or os.environ.get("PLAN_TEST_TOKEN")
        or os.environ.get("SUPABASE_ACCESS_TOKEN")
    )
    if token:
        return token

    supabase_url = args.supabase_url or SCRIPT_DEFAULTS["supabase_url"] or os.environ.get("SUPABASE_URL")
    supabase_anon_key = (
        args.supabase_anon_key
        or SCRIPT_DEFAULTS["supabase_anon_key"]
        or os.environ.get("SUPABASE_ANON_KEY")
    )
    email = args.email or SCRIPT_DEFAULTS["email"] or os.environ.get("PLAN_TEST_EMAIL")
    password = args.password or SCRIPT_DEFAULTS["password"] or os.environ.get("PLAN_TEST_PASSWORD")

    missing = [
        name
        for name, value in [
            ("supabase_url", supabase_url),
            ("supabase_anon_key", supabase_anon_key),
            ("email", email),
            ("password", password),
        ]
        if not value
    ]
    if missing:
        missing_text = ", ".join(missing)
        raise ValueError(
            "Missing bearer token and sign-in inputs. "
            "Provide --token, or set these for automatic login: "
            f"{missing_text}."
        )

    return fetch_supabase_access_token(
        supabase_url=supabase_url,
        supabase_anon_key=supabase_anon_key,
        email=email,
        password=password,
    )


def selected_tags(args: argparse.Namespace) -> list[str]:
    if args.tag is not None:
        return args.tag
    return list(SCRIPT_DEFAULTS["tags"])


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    payload = dict(PRESETS[args.preset])

    duration = args.duration if args.duration is not None else SCRIPT_DEFAULTS["duration"]
    effort = args.effort if args.effort is not None else SCRIPT_DEFAULTS["effort"]
    tags = selected_tags(args)
    regen_attempt = args.regen_attempt if args.regen_attempt is not None else SCRIPT_DEFAULTS["regen_attempt"]

    if duration is not None:
        payload["duration_minutes"] = duration
    if effort is not None:
        payload["effort"] = effort
    if tags:
        payload["requested_tags"] = normalize_tags(tags)
    else:
        payload["requested_tags"] = normalize_tags(payload.get("requested_tags", []))

    if regen_attempt is not None:
        if regen_attempt < 0 or regen_attempt > 50:
            raise ValueError("regen_attempt must be between 0 and 50")
        payload["regen_attempt"] = regen_attempt

    return payload


def normalize_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()

    for tag in tags:
        value = tag.strip().lower()
        if not value or value in seen:
            continue
        if value not in VALID_TAGS:
            allowed = ", ".join(VALID_TAGS)
            raise ValueError(f"Invalid tag '{tag}'. Allowed tags: {allowed}")
        seen.add(value)
        cleaned.append(value)

    return cleaned


def fetch_supabase_access_token(
    *,
    supabase_url: str,
    supabase_anon_key: str,
    email: str,
    password: str,
) -> str:
    url = f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "apikey": supabase_anon_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            data = parse_json(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = parse_json(exc.read().decode("utf-8"))
        raise ValueError(f"Supabase sign-in failed with HTTP {exc.code}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"Supabase sign-in failed: {exc}") from exc

    if not isinstance(data, dict) or not isinstance(data.get("access_token"), str) or not data["access_token"]:
        raise ValueError(f"Supabase sign-in did not return an access_token: {data}")

    return data["access_token"]


def send_request(url: str, token: str, payload: dict[str, Any], timeout: int) -> tuple[int, dict[str, str], Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return response.status, dict(response.headers.items()), parse_json(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, dict(exc.headers.items()), parse_json(raw)


def parse_json(raw: str) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def print_request_summary(url: str, payload: dict[str, Any]) -> None:
    print("Request URL:")
    print(url)
    print()
    print("Request payload:")
    print(json.dumps(payload, indent=2))
    print()


def print_response_summary(status: int, headers: dict[str, str], response_body: Any) -> None:
    print(f"HTTP {status}")
    content_type = headers.get("Content-Type") or headers.get("content-type")
    if content_type:
        print(f"Content-Type: {content_type}")
    print()

    if isinstance(response_body, dict):
        plan = response_body.get("plan")
        request_body = response_body.get("request")
        if isinstance(request_body, dict):
            print("Echoed request:")
            print(json.dumps(request_body, indent=2))
            print()
        if isinstance(plan, dict):
            print_plan_summary(plan)

    print("Raw response:")
    print(json.dumps(response_body, indent=2) if not isinstance(response_body, str) else response_body)


def print_plan_summary(plan: dict[str, Any]) -> None:
    metadata = plan.get("metadata") if isinstance(plan.get("metadata"), dict) else {}
    segments = plan.get("segments") if isinstance(plan.get("segments"), list) else []

    print("Plan summary:")
    print(
        f"- duration: {plan.get('duration_minutes')} min"
        f" | estimated_distance: {plan.get('estimated_distance_m')} m"
    )
    print(
        f"- version: {metadata.get('version')}"
        f" | level: {metadata.get('swim_level')}"
        f" | archetype: {metadata.get('archetype_name') or metadata.get('archetype_id')}"
    )

    if segments:
        print("- segments:")
        for index, segment in enumerate(segments[:8], start=1):
            if not isinstance(segment, dict):
                continue
            description = segment.get("description") or segment.get("kind") or segment.get("type")
            distance = segment.get("distance_m")
            effort = segment.get("effort")
            print(f"  {index}. {distance} m | {effort} | {description}")
        if len(segments) > 8:
            print(f"  ... {len(segments) - 8} more segments")

    print()


def main() -> int:
    load_dotenv()
    args = parse_args()

    if args.list_presets:
        return list_presets()

    try:
        url = resolve_url(args)
        token = resolve_token(args)
        payload = build_payload(args)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print_request_summary(url, payload)

    try:
        status, headers, response_body = send_request(url, token, payload, args.timeout)
    except urllib.error.URLError as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1

    if args.raw_only:
        print(json.dumps(response_body, indent=2) if not isinstance(response_body, str) else response_body)
    else:
        print_response_summary(status, headers, response_body)

    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    raise SystemExit(main())
