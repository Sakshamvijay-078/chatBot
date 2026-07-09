import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(backend_dir)

from dotenv import load_dotenv
load_dotenv()

import jwt

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

try:
    unverified = jwt.get_unverified_header(SUPABASE_ANON_KEY)
    print("Header:", unverified)
    decoded = jwt.decode(
        SUPABASE_ANON_KEY,
        SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        audience=None,
        options={"verify_aud": False}
    )
    print("MATCH! Decoded successfully:", decoded)
except Exception as e:
    print("MISMATCH!", e)
