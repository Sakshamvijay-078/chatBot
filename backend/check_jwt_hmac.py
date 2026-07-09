import hmac
import hashlib
import base64
import os

anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjbWZsZ3VpbWd0Y2Jza21lcGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDI1MTAsImV4cCI6MjA5NzE3ODUxMH0.w092N9tw6nf4fKJlDRIjTh8LcOpVXHzKqZd9awj_EKs"
jwt_secret = "wPtnuvwCAyJ6PGmEZ9LtXRkbt8Yu9gB2lhUq5FIF/GIE+7OSi91cA8JD7lOEcRke9Ji/tEqOX/R0gKOFm2hQ+w=="

def b64url_decode(v):
    v += '=' * (-len(v) % 4)
    return base64.urlsafe_b64decode(v)

header, payload, signature = anon_key.split(".")
msg = f"{header}.{payload}".encode("ascii")

# Sometimes the secret is raw bytes, sometimes it needs base64 decoding.
# Let's try both.
print("Trying raw string as secret...")
sig1 = hmac.new(jwt_secret.encode('utf-8'), msg, hashlib.sha256).digest()
encoded_sig1 = base64.urlsafe_b64encode(sig1).decode('ascii').rstrip('=')
print("Sig1:", encoded_sig1)

print("Trying base64 decoded secret...")
try:
    secret_bytes = b64url_decode(jwt_secret)
    sig2 = hmac.new(secret_bytes, msg, hashlib.sha256).digest()
    encoded_sig2 = base64.urlsafe_b64encode(sig2).decode('ascii').rstrip('=')
    print("Sig2:", encoded_sig2)
except Exception as e:
    print("Failed to decode secret as base64:", e)

print("Expected Signature:", signature)
if signature in (encoded_sig1, encoded_sig2):
    print("MATCH!")
else:
    print("MISMATCH!")
