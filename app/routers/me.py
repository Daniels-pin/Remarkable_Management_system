from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.core.deps import ActorContext, get_actor_context, get_db
from app.models.user import User, UserProfile
from app.schemas.user import UserMeResponse, UserProfileResponse, UserProfileSelfUpdate

router = APIRouter(prefix="/me", tags=["me"])


def _ensure_profile(db: Session, user: User) -> UserProfile:
    if user.profile is None:
        p = UserProfile(user_id=user.id)
        db.add(p)
        db.flush()
        user.profile = p
    return user.profile


@router.get("", response_model=UserMeResponse)
def read_me(
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> User:
    user = db.query(User).options(joinedload(User.profile)).filter(User.id == actor.user.id).one()
    _ensure_profile(db, user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/profile", response_model=UserProfileResponse)
def update_profile(
    body: UserProfileSelfUpdate,
    db: Session = Depends(get_db),
    actor: ActorContext = Depends(get_actor_context),
) -> UserProfile:
    user = db.query(User).options(joinedload(User.profile)).filter(User.id == actor.user.id).one()
    profile = _ensure_profile(db, user)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(profile, k, v)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
