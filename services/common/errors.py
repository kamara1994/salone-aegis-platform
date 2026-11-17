# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Joseph Allan Kamara
class DomainError(Exception):
    def __init__(self, code, message, status=400, details=None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
        self.details = details or {}

    def payload(self):
        return {'error': {'code': self.code, 'message': self.message, 'details': self.details}}
