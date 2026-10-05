"""JSON configuration (no secrets inside: only Credential Manager target names)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Optional

from .preflight import Thresholds
from .publish import validate_remote_dir, validate_remote_name, PublishError

MODES = ('shadow', 'publish')


class ConfigError(Exception):
    pass


@dataclass
class PublishConfig:
    host: str
    port: int
    remote_dir: str
    credential_target: str
    label: str = 'candidate'
    file_name: str = 'export.xml'
    manifest_file_name: str = 'export.manifest.json'
    ca_file: Optional[str] = None
    timeout_seconds: float = 60
    require_remote_size: bool = True


@dataclass
class Config:
    source_db_path: str
    work_dir: str
    output_dir: str
    log_dir: str
    state_dir: str
    mode: str = 'shadow'
    max_attempts: int = 3
    pause_seconds: float = 5
    retry_delay_seconds: float = 60
    keep_runs: int = 3
    keep_outputs: int = 14
    thresholds: Thresholds = field(default_factory=Thresholds)
    publish: Optional[PublishConfig] = None
    alerts: Optional[dict] = None


def _abs(path: str, name: str) -> str:
    if not isinstance(path, str) or not path or not os.path.isabs(path):
        raise ConfigError('%s must be an absolute path' % name)
    return os.path.normcase(os.path.realpath(path))


def _inside(child: str, parent: str) -> bool:
    try:
        return os.path.commonpath([child, parent]) == parent
    except ValueError:  # different drives
        return False


def load_config(path: str) -> Config:
    try:
        with open(path, encoding='utf-8') as fh:
            raw = json.load(fh)
    except (OSError, ValueError) as e:
        raise ConfigError('cannot read config %s: %s' % (path, e))
    return parse_config(raw)


def parse_config(raw: dict) -> Config:
    if not isinstance(raw, dict):
        raise ConfigError('config root must be an object')
    src = raw.get('source') or {}
    paths = raw.get('paths') or {}
    snap = raw.get('snapshot') or {}
    pf = raw.get('preflight') or {}
    db = _abs(src.get('dbPath', ''), 'source.dbPath')
    dirs = {k: _abs(paths.get(k, ''), 'paths.' + k) for k in ('workDir', 'outputDir', 'logDir', 'stateDir')}
    for k, d in dirs.items():
        if _inside(d, db) or _inside(db, d):
            raise ConfigError('paths.%s must not be inside (or contain) the live GrinS directory' % k)
    mode = raw.get('mode', 'shadow')
    if mode not in MODES:
        raise ConfigError('mode must be one of %s' % ', '.join(MODES))
    try:
        t = Thresholds(
            min_products=int(pf.get('minProducts', 14000)),
            max_drop_ratio=float(pf.get('maxDropRatio', 0.10)),
            max_growth_ratio=float(pf.get('maxGrowthRatio', 0.20)),
            max_quantity_drop_ratio=float(pf.get('maxQuantityDropRatio', 0.30)),
            max_quantity_growth_factor=float(pf.get('maxQuantityGrowthFactor', 3.0)),
        )
        cfg = Config(
            source_db_path=db, work_dir=dirs['workDir'], output_dir=dirs['outputDir'], log_dir=dirs['logDir'],
            state_dir=dirs['stateDir'], mode=mode,
            max_attempts=int(snap.get('maxAttempts', 3)), pause_seconds=float(snap.get('pauseBetweenCopiesSeconds', 5)),
            retry_delay_seconds=float(snap.get('retryDelaySeconds', 60)), keep_runs=int(snap.get('keepRuns', 3)),
            keep_outputs=int(raw.get('keepOutputs', 14)), thresholds=t, alerts=raw.get('alerts'),
        )
    except (TypeError, ValueError) as e:
        raise ConfigError('invalid numeric setting: %s' % e)
    if not 1 <= cfg.max_attempts <= 10:
        raise ConfigError('snapshot.maxAttempts must be 1..10')
    if t.min_products < 1 or not 0 < t.max_drop_ratio < 1 or t.max_growth_ratio <= 0:
        raise ConfigError('preflight thresholds out of range')
    pub = raw.get('publish')
    if pub:
        try:
            cfg.publish = PublishConfig(
                host=str(pub['host']), port=int(pub.get('port', 21)), remote_dir=validate_remote_dir(str(pub.get('remoteDir', ''))),
                credential_target=str(pub['credentialTarget']), label=str(pub.get('label', 'candidate')),
                file_name=validate_remote_name(str(pub.get('fileName', 'export.xml'))),
                manifest_file_name=validate_remote_name(str(pub.get('manifestFileName', 'export.manifest.json'))),
                ca_file=pub.get('caFile'), timeout_seconds=float(pub.get('timeoutSeconds', 60)),
                require_remote_size=bool(pub.get('requireRemoteSize', True)),
            )
        except KeyError as e:
            raise ConfigError('publish.%s is required' % e.args[0])
        except PublishError as e:
            raise ConfigError(str(e))
        if cfg.publish.file_name == cfg.publish.manifest_file_name:
            raise ConfigError('publish.fileName and publish.manifestFileName must differ')
        if any(k in pub for k in ('password', 'user', 'username')):
            raise ConfigError('credentials must not be in the config file; use publish.credentialTarget')
    if mode == 'publish' and not cfg.publish:
        raise ConfigError('mode "publish" requires a publish section')
    return cfg
