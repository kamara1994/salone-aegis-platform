import argparse
from services.common.store import Store
from services.common.config import Settings
from services.evidence.service import records, verify_chain

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('client_id')
    args = parser.parse_args()
    with Store(Settings().database_url).transaction() as tx:
        result = verify_chain(records(tx, args.client_id))
    print('Evidence chain valid' if result else 'EVIDENCE CHAIN INVALID')
    raise SystemExit(0 if result else 1)
