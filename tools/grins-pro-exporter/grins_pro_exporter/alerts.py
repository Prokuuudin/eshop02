"""Failure alerts. The exporter runs on the GrinS LAN machine, outside the Hairshop Pro web app,
so the app's sendEmail/SYNC_ALERT_EMAIL path is not reachable from here; this is the same idea
(an e-mail per failed run) behind a small adapter. Alerting never changes the run outcome and a
missing alert configuration never hides the failure: it is always in the JSON log and exit code.

  {"type": "none"}
  {"type": "smtp", "host": "...", "port": 587, "from": "...", "to": ["..."], "credentialTarget": "GrinsProExporter/smtp"}
  {"type": "webhook", "credentialTarget": "GrinsProExporter/webhook"}   # secret = https URL (may embed a token)
"""
from __future__ import annotations

import json
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from typing import Callable, Optional

from .credentials import Credential


class AlertError(Exception):
    pass


class NullAlert:
    kind = 'none'

    def send(self, subject: str, body: dict) -> None:
        return None


class SmtpAlert:
    kind = 'smtp'

    def __init__(self, host: str, port: int, sender: str, to: list, credential_loader: Callable[[], Credential],
                 smtp_factory=smtplib.SMTP, timeout: float = 30):
        if not host or not to or not sender:
            raise AlertError('smtp alert needs host, from and to')
        self.host, self.port, self.sender, self.to = host, int(port), sender, list(to)
        self.credential_loader = credential_loader
        self.smtp_factory = smtp_factory
        self.timeout = timeout

    def send(self, subject: str, body: dict) -> None:
        cred = self.credential_loader()
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = self.sender
        msg['To'] = ', '.join(self.to)
        msg.set_content(json.dumps(body, ensure_ascii=False, indent=2, default=str))
        with self.smtp_factory(self.host, self.port, timeout=self.timeout) as s:
            s.starttls(context=ssl.create_default_context())   # verified TLS, never plaintext auth
            s.login(cred.username, cred.secret)
            s.send_message(msg)


class WebhookAlert:
    kind = 'webhook'

    def __init__(self, credential_loader: Callable[[], Credential], opener=urllib.request.urlopen, timeout: float = 30):
        self.credential_loader = credential_loader
        self.opener = opener
        self.timeout = timeout

    def send(self, subject: str, body: dict) -> None:
        url = self.credential_loader().secret
        if not url.lower().startswith('https://'):
            raise AlertError('webhook URL must be https')
        data = json.dumps({'subject': subject, **body}, ensure_ascii=False, default=str).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST', headers={'Content-Type': 'application/json'})
        with self.opener(req, timeout=self.timeout, context=ssl.create_default_context()) as resp:
            if resp.status >= 300:
                raise AlertError('webhook answered HTTP %d' % resp.status)


def build_alert(cfg: Optional[dict], credential_reader: Callable[[str], Credential]):
    cfg = cfg or {'type': 'none'}
    kind = cfg.get('type', 'none')
    if kind == 'none':
        return NullAlert()
    target = cfg.get('credentialTarget')
    if not target:
        raise AlertError('alerts.credentialTarget is required for %s alerts' % kind)
    loader = lambda: credential_reader(target)  # noqa: E731 - read lazily, only when a failure happens
    if kind == 'smtp':
        return SmtpAlert(cfg.get('host', ''), cfg.get('port', 587), cfg.get('from', ''), cfg.get('to') or [], loader)
    if kind == 'webhook':
        return WebhookAlert(loader)
    raise AlertError('unknown alerts.type %r' % kind)
