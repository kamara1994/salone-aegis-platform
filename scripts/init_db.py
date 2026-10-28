from services.common.config import Settings
from services.common.store import Store
from services.common.seed import seed
if __name__ == '__main__':
    settings = Settings()
    store = Store(settings.database_url)
    if not store.postgres:
        store.initialize()
    seed(store, settings.scenario_dir)
