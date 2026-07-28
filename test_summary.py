import sys
import os
sys.path.append(os.getcwd())
from app import generate_daily_summary
res = generate_daily_summary()
print("Result:", res)
