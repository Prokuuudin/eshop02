"""Secrets come only from Windows Credential Manager (generic credentials, per Windows user).

Create once, logged in as the account that runs the scheduled task:
    cmdkey /generic:GrinsProExporter/ftps /user:<ftps-user> /pass
(cmdkey prompts for the password, so it never lands in shell history.)
Nothing here ever logs, prints or returns the secret inside an exception message.
"""
from __future__ import annotations

import sys


class SecretError(Exception):
    pass


class Credential:
    __slots__ = ('username', '_secret', 'target')

    def __init__(self, target: str, username: str, secret: str):
        self.target = target
        self.username = username
        self._secret = secret

    @property
    def secret(self) -> str:
        return self._secret

    def __repr__(self) -> str:
        return 'Credential(target=%r, username=%r, secret=[REDACTED])' % (self.target, self.username)

    __str__ = __repr__


def read_windows_credential(target: str) -> Credential:
    if sys.platform != 'win32':
        raise SecretError('Windows Credential Manager is only available on Windows')
    import ctypes
    from ctypes import wintypes

    class CREDENTIAL(ctypes.Structure):
        _fields_ = [('Flags', wintypes.DWORD), ('Type', wintypes.DWORD), ('TargetName', wintypes.LPWSTR),
                    ('Comment', wintypes.LPWSTR), ('LastWritten', wintypes.FILETIME),
                    ('CredentialBlobSize', wintypes.DWORD), ('CredentialBlob', ctypes.POINTER(ctypes.c_ubyte)),
                    ('Persist', wintypes.DWORD), ('AttributeCount', wintypes.DWORD), ('Attributes', ctypes.c_void_p),
                    ('TargetAlias', wintypes.LPWSTR), ('UserName', wintypes.LPWSTR)]

    advapi32 = ctypes.WinDLL('advapi32', use_last_error=True)
    advapi32.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(CREDENTIAL))]
    advapi32.CredReadW.restype = wintypes.BOOL
    advapi32.CredFree.argtypes = [ctypes.c_void_p]
    pcred = ctypes.POINTER(CREDENTIAL)()
    if not advapi32.CredReadW(target, 1, 0, ctypes.byref(pcred)):  # CRED_TYPE_GENERIC
        raise SecretError('credential %r not found for this Windows user (error %d)' % (target, ctypes.get_last_error()))
    try:
        c = pcred.contents
        blob = ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize)
        secret = blob.decode('utf-16-le') if blob else ''
        user = c.UserName or ''
    finally:
        advapi32.CredFree(pcred)
    if not user or not secret:
        raise SecretError('credential %r has an empty user name or secret' % target)
    return Credential(target, user, secret)
