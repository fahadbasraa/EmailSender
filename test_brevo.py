import requests
import os
import json
from dotenv import load_dotenv

load_dotenv(r"c:\Users\salma\Desktop\CV Bulk Email Sender\.env")

key = os.getenv('BREVO_API_KEY','')
print(f"Key loaded: {bool(key)}")

try:
    r = requests.get('https://api.brevo.com/v3/account', headers={'api-key': key, 'accept': 'application/json'}, timeout=10)
    print('Account Status:', r.status_code)
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print("Account fetch error:", e)

try:
    r2 = requests.get('https://api.brevo.com/v3/senders', headers={'api-key': key, 'accept': 'application/json'}, timeout=10)
    print('\nSenders Status:', r2.status_code)
    print(json.dumps(r2.json(), indent=2))
except Exception as e:
    print("Senders fetch error:", e)
