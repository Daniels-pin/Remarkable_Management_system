from __future__ import annotations

from fastapi import Depends

from app.auth.rbac import (
    require_admin,
    require_barber,
    require_manager_or_admin,
    require_service_provider,
)
from app.core.security import ActorContext, get_actor_context, get_actor_context_optional
from app.database.session import get_db

__all__ = [
    "ActorContext",
    "get_actor_context",
    "get_actor_context_optional",
    "get_db",
    "get_admin_actor",
    "get_manager_or_admin_actor",
    "get_barber_actor",
    "get_service_provider_actor",
]


def get_barber_actor(actor: ActorContext = Depends(get_actor_context)) -> ActorContext:
    require_barber(actor.user)
    return actor


def get_service_provider_actor(actor: ActorContext = Depends(get_actor_context)) -> ActorContext:
    require_service_provider(actor.user)
    return actor


def get_admin_actor(actor: ActorContext = Depends(get_actor_context)) -> ActorContext:
    require_admin(actor.user)
    return actor


def get_manager_or_admin_actor(actor: ActorContext = Depends(get_actor_context)) -> ActorContext:
    require_manager_or_admin(actor.user)
    return actor
