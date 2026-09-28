#!/usr/bin/env python3
"""Safely validate and replace local + Vercel Bright Data credentials."""
from __future__ import annotations

import getpass
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / '.env'
VERCEL = (Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node'),
          ROOT.parents[1] / 'work/vercel-cli-clean/node_modules/vercel/dist/vc.js')
SCOPE = 'saumay-srivastavas-projects-bccd1c0f'


def env_values() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_FILE.exists():
        return values
    for line in ENV_FILE.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


def replace_env(values: dict[str, str]) -> None:
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    found: set[str] = set()
    output: list[str] = []
    for line in lines:
        if '=' in line and not line.lstrip().startswith('#'):
            key = line.split('=', 1)[0].strip()
            if key in values:
                output.append(f'{key}={values[key]}')
                found.add(key)
                continue
        output.append(line)
    for key, value in values.items():
        if key not in found:
            output.append(f'{key}={value}')
    with tempfile.NamedTemporaryFile('w', dir=ENV_FILE.parent, delete=False) as temp:
        temp.write('\n'.join(output).rstrip() + '\n')
        temp_path = Path(temp.name)
    os.chmod(temp_path, 0o600)
    temp_path.replace(ENV_FILE)


def update_vercel(name: str, value: str) -> None:
    command = [str(VERCEL[0]), str(VERCEL[1]), 'env', 'update', name, 'production',
               '--yes', '--sensitive', '--scope', SCOPE]
    completed = subprocess.run(command, cwd=ROOT, input=value + '\n', text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if completed.returncode:
        raise RuntimeError(f'Could not update Vercel {name}: {completed.stdout[-800:]}')


def validate(key: str, zone: str) -> None:
    response = httpx.post(
        'https://api.brightdata.com/request',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={'zone': zone,
              'url': 'https://www.google.com/search?q=site%3Ainstagram.com+Darkmap&hl=en&gl=us',
              'format': 'raw', 'data_format': 'parsed_light'}, timeout=45)
    if response.status_code != 200:
        detail = response.text[:400].replace(key, '[REDACTED]')
        raise RuntimeError(f'Bright Data validation returned HTTP {response.status_code}: {detail}')
    try:
        payload = response.json()
        if isinstance(payload, dict) and isinstance(payload.get('body'), str):
            json.loads(payload['body'])
    except (ValueError, TypeError) as error:
        raise RuntimeError('Bright Data returned an invalid JSON response for the SERP zone') from error


def discover_serp_zones(key: str) -> list[str]:
    response = httpx.get(
        'https://api.brightdata.com/zone/get_active_zones',
        headers={'Authorization': f'Bearer {key}'}, timeout=30)
    if response.status_code != 200:
        return []
    try:
        payload = response.json()
    except ValueError:
        return []
    zones = payload if isinstance(payload, list) else payload.get('zones', [])
    matches: list[str] = []
    for item in zones if isinstance(zones, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get('name') or '').strip()
        zone_type = str(item.get('type') or item.get('product_type') or '').lower()
        if name and ('serp' in zone_type or 'serp' in name.lower()):
            matches.append(name)
    return sorted(set(matches))


def main() -> int:
    current = env_values()
    current_zone = current.get('BRIGHT_DATA_SERP_ZONE', '')
    print('Darkmap Bright Data credential replacement')
    print('The key will remain hidden and will be validated before anything is changed.')
    key = getpass.getpass('New Bright Data API key: ').strip()
    if not key:
        print('No key entered; nothing changed.')
        return 1
    print('Finding the new account’s active SERP zone…')
    zones = discover_serp_zones(key)
    if len(zones) == 1:
        zone = zones[0]
        print(f'Using detected SERP zone: {zone}')
    else:
        if zones:
            print('Detected SERP zones: ' + ', '.join(zones))
        zone_label = f' [{current_zone}]' if current_zone else ''
        zone = input(f'New account SERP zone name{zone_label}: ').strip() or current_zone
    if not zone:
        print('A SERP zone name is required; nothing changed.')
        return 1
    print('Validating the new account and SERP zone…')
    validate(key, zone)
    print('Validation succeeded. Updating Vercel Production and local configuration…')
    update_vercel('BRIGHT_DATA_API_KEY', key)
    update_vercel('BRIGHT_DATA_SERP_ZONE', zone)
    replace_env({'BRIGHT_DATA_API_KEY': key, 'BRIGHT_DATA_SERP_ZONE': zone})
    print('Credentials replaced successfully. Redeploy Darkmap to activate them.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f'ERROR: {error}', file=sys.stderr)
        raise SystemExit(2)
