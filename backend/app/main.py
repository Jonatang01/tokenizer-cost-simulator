# --------------------------------------------------------
# Tokenizer & Cost Simulator Backend
# Autor: Jonatan Gutierrez (JG)
# --------------------------------------------------------

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router
from app.config import settings
from app.db.seed import bootstrap


def create_app() -> FastAPI:
    bootstrap()

    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
