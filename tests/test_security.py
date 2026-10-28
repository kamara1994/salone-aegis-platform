import base64
import hashlib
import hmac
import json
import unittest
from services.adapters.guacamole import sign_assertion
from services.common.config import Settings
from services.common.errors import DomainError
from services.adapters.live import request

class SecurityTests(unittest.TestCase):
    def test_guacamole_assertion_round_trip(self):
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives.padding import PKCS7
        key = bytes(range(16))
        value = {'username': 'operator', 'expires': 1234567890000, 'connections': {}}
        encoded = sign_assertion(value, key.hex())
        decryptor = Cipher(algorithms.AES(key), modes.CBC(bytes(16))).decryptor()
        decrypted = decryptor.update(base64.b64decode(encoded)) + decryptor.finalize()
        unpadder = PKCS7(128).unpadder()
        signed = unpadder.update(decrypted) + unpadder.finalize()
        signature, payload = signed[:32], signed[32:]
        self.assertEqual(signature, hmac.new(key, payload, hashlib.sha256).digest())
        self.assertEqual(json.loads(payload), value)

    def test_live_adapters_refuse_cleartext(self):
        with self.assertRaises(DomainError):
            request('http://example.invalid')

    def test_production_rejects_development_auth(self):
        with self.assertRaises(ValueError):
            Settings(environment='production', auth_mode='dev', dev_token='x' * 40,
                     confirmation_secret='y' * 40).validate()

    def test_confirmation_secret_is_required(self):
        with self.assertRaises(ValueError):
            Settings(confirmation_secret='').validate()

    def test_weak_dev_token_is_rejected(self):
        with self.assertRaises(ValueError):
            Settings(auth_mode='dev', dev_token='weak', confirmation_secret='x' * 40).validate()
